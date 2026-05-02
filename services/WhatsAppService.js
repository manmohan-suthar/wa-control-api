import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import * as qrcode from "qrcode";
import { writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  WhatsAppSession as SessionModel,
  Message,
  WaChat,
  WaChatMessage,
} from "../models/index.js";
import { handleIncomingMessage } from "./AiAgentService.js";
import { executeFlowOnMessage } from "../controllers/flowExecutionController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SESSIONS_DIR = join(__dirname, "..", "sessions");

class WhatsAppService {
  constructor() {
    this.sockets = new Map();
    this.io = null;
    this.pendingQRCodes = new Map(); // sessionId -> latest QR data URL (race condition fix)
    this.reconnectAttempts = new Map();
    this.pendingReconnects = new Set(); // guard against concurrent reconnect calls for same session

    if (!existsSync(SESSIONS_DIR)) {
      mkdirSync(SESSIONS_DIR, { recursive: true });
    }
  }

  setSocketIO(io) {
    this.io = io;
  }

  async getSocketVersion() {
    try {
      const { version } = await fetchLatestBaileysVersion();
      return version;
    } catch (err) {
      console.warn(
        "Failed to fetch latest Baileys version, using default:",
        err.message,
      );
      return undefined;
    }
  }

  async removeSessionFiles(sessionId) {
    const sessionPath = join(SESSIONS_DIR, sessionId);
    if (existsSync(sessionPath)) {
      const files = ["creds.json", "keys.json"];
      for (const file of files) {
        try {
          writeFileSync(join(sessionPath, file), JSON.stringify({}));
        } catch (e) {}
      }
    }
  }

  async createSocket(sessionId, authState) {
    const io = this.io;
    let isConnected = false;
    let isLoggingOut = false;
    let hasGeneratedQR = false;
    const version = await this.getSocketVersion();

    // Use auth state with saveCreds
    const sock = makeWASocket({
      auth: authState.state,
      printQRInTerminal: false,
      version,
      browser: Browsers.ubuntu("Chrome"),
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
    });

    // QR Handler
    sock.ev.on("connection.update", (update) => {
      const { qr, connection } = update;

      console.log(`[${sessionId}] Connection update:`, {
        connection,
        hasQR: !!qr,
      });

      // QR CODE HANDLER
      if (qr) {
        hasGeneratedQR = true;
        console.log(`[${sessionId}] QR RECEIVED!`);

        qrcode.toDataURL(qr, (err, url) => {
          if (!err && url) {
            this.pendingQRCodes.set(sessionId, url); // cache for late joiners
            console.log(`[${sessionId}] Emitting QR code`);
            if (io) {
              io.to(sessionId).emit("qrcode", { sessionId, qr: url });
              io.to(sessionId).emit("status", { sessionId, status: "qr" });
            }
          } else if (err) {
            console.error(`[${sessionId}] QR generate error:`, err.message);
          }
        });
      }

      // Connection opened
      if (connection === "open") {
        console.log(`[${sessionId}] Connected!`);
        isConnected = true;
        this.reconnectAttempts.delete(sessionId);
        this.pendingQRCodes.delete(sessionId); // QR no longer needed
        const phone = (sock.user?.id || "").split("@")[0].split(":")[0];

        SessionModel.updateOne(
          { sessionId },
          { status: "connected", phoneNumber: phone },
        ).catch(console.error);

        if (io) {
          io.to(sessionId).emit("status", {
            sessionId,
            status: "connected",
            phoneNumber: phone,
          });
        }
      }

      // Connection closed
      if (connection === "close") {
        if (isLoggingOut) {
          console.log(`[${sessionId}] Logged out intentionally`);
          return;
        }

        const reason =
          update.lastDisconnect?.error instanceof Boom
            ? update.lastDisconnect.error.output.statusCode
            : 0;

        const shouldReconnect = reason !== DisconnectReason.loggedOut;
        const isRestartRequired = reason === DisconnectReason.restartRequired;
        const isRegistered = !!authState.state.creds?.registered;
        const attempts = this.reconnectAttempts.get(sessionId) || 0;

        console.log(`[${sessionId}] Connection closed, reason:`, reason);

        isConnected = false;

        if (isRestartRequired || (shouldReconnect && isRegistered)) {
          console.log(`[${sessionId}] Will reconnect...`);
          this.sockets.delete(sessionId);
          setTimeout(() => {
            this.reconnectSession(sessionId).catch(console.error);
          }, 3000);
        } else if (shouldReconnect && !isRegistered && hasGeneratedQR) {
          // QR was already issued; avoid deleting auth files because that can invalidate
          // a QR that the user is currently scanning in WhatsApp.
          console.log(
            `[${sessionId}] Pre-auth close after QR, retrying without auth reset...`,
          );
          this.sockets.delete(sessionId);
          setTimeout(() => {
            this.reconnectSession(sessionId).catch(console.error);
          }, 2500);
        } else if (shouldReconnect && !isRegistered && attempts < 2) {
          // Fresh sessions can fail pre-auth with stale key material; reset once and retry.
          this.reconnectAttempts.set(sessionId, attempts + 1);
          console.log(
            `[${sessionId}] Pre-auth close, resetting auth files and retrying (${attempts + 1}/2)`,
          );

          this.sockets.delete(sessionId);
          try {
            const sessionPath = join(SESSIONS_DIR, sessionId);
            rmSync(sessionPath, { recursive: true, force: true });
            mkdirSync(sessionPath, { recursive: true });
          } catch (e) {
            console.error(
              `[${sessionId}] Failed to reset auth files:`,
              e.message,
            );
          }

          setTimeout(() => {
            this.reconnectSession(sessionId).catch(console.error);
          }, 1500);
        } else if (!shouldReconnect) {
          // Genuine WhatsApp logout — user scanned "Log out" on phone
          console.log(
            `[${sessionId}] Logged out from WhatsApp, marking disconnected`,
          );
          SessionModel.updateOne(
            { sessionId },
            { status: "disconnected" },
          ).catch(console.error);
          if (io)
            io.to(sessionId).emit("status", {
              sessionId,
              status: "disconnected",
            });
          this.emitSessionUpdate(sessionId, { status: "disconnected" });
        } else {
          // Unexpected close (pre-auth retries exhausted or unknown reason).
          // If creds.json still exists the phone is likely still authenticated —
          // schedule one recovery reconnect with a longer delay before giving up.
          const credsPath = join(SESSIONS_DIR, sessionId, "creds.json");
          if (existsSync(credsPath)) {
            console.log(
              `[${sessionId}] Unexpected close but creds exist — recovery reconnect in 15 s`,
            );
            this.reconnectAttempts.delete(sessionId); // reset counter for next attempt
            SessionModel.updateOne(
              { sessionId },
              { status: "connecting" },
            ).catch(console.error);
            if (io)
              io.to(sessionId).emit("status", {
                sessionId,
                status: "connecting",
              });
            this.emitSessionUpdate(sessionId, { status: "connecting" });
            setTimeout(() => {
              if (!this.sockets.has(sessionId)) {
                this.reconnectSession(sessionId).catch((err) => {
                  console.error(
                    `[${sessionId}] Recovery reconnect failed:`,
                    err.message,
                  );
                  this.emitSessionUpdate(sessionId, { status: "disconnected" });
                  SessionModel.updateOne(
                    { sessionId },
                    { status: "disconnected" },
                  ).catch(console.error);
                  if (io)
                    io.to(sessionId).emit("status", {
                      sessionId,
                      status: "disconnected",
                    });
                });
              }
            }, 15_000);
          } else {
            SessionModel.updateOne(
              { sessionId },
              { status: "disconnected" },
            ).catch(console.error);
            if (io)
              io.to(sessionId).emit("status", {
                sessionId,
                status: "disconnected",
              });
          }
        }
      }
    });

    // Save credentials
    sock.ev.on("creds.update", authState.saveCreds);

    // ── In-memory contact name store (per socket lifetime) ────────────────────
    const contactNames = new Map(); // jid → display name
    const lidPhones = new Map(); // lid-jid → phone number (Meta linked-identity mapping)

    // Extract clean phone number from a JID — returns null for @lid JIDs (not real phones)
    const rawPhoneFrom = (jid) => {
      if (!jid) return null;
      if (jid.endsWith("@lid")) return null; // LID = Meta internal ID, not a phone
      if (jid.endsWith("@g.us")) return jid; // groups keep full jid as identifier
      return jid.replace(/@.*/, ""); // individual: strip @s.whatsapp.net
    };

    // ── contacts.upsert — build in-memory name lookup ─────────────────────────
    sock.ev.on("contacts.upsert", (contacts) => {
      for (const c of contacts) {
        const name = c.name || c.notify || c.verifiedName || "";
        if (c.id && name) contactNames.set(c.id, name);
        // Newer WA sometimes provides the real phone number on a @lid contact
        if (c.id && c.id.endsWith("@lid") && c.phoneNumber) {
          lidPhones.set(c.id, c.phoneNumber.replace(/\D/g, ""));
        }
      }
    });

    sock.ev.on("contacts.update", (updates) => {
      for (const c of updates) {
        const name = c.name || c.notify || "";
        if (c.id && name) contactNames.set(c.id, name);
        if (c.id && c.id.endsWith("@lid") && c.phoneNumber) {
          lidPhones.set(c.id, c.phoneNumber.replace(/\D/g, ""));
        }
      }
    });

    // Helper: best display name for a JID
    const getDisplayName = (jid, fallbackPushName = "") => {
      return contactNames.get(jid) || fallbackPushName || null;
    };

    // ── chats.upsert — sync full chat list (fires on every connect) ───────────
    sock.ev.on("chats.upsert", async (chats) => {
      try {
        const session = await SessionModel.findOne({ sessionId });
        if (!session) return;
        const userId = session.userId;

        const ops = chats
          .map((chat) => {
            const jid = chat.id;
            if (!jid || jid === "status@broadcast") return null;

            // Use lidPhones map first so @lid contacts get real phone numbers
            const rawPhone = lidPhones.get(jid) || rawPhoneFrom(jid);
            const contactName =
              chat.name ||
              getDisplayName(jid) ||
              (rawPhone && !jid.endsWith("@g.us") ? rawPhone : null) ||
              null;

            const lastMsgTimestamp = chat.conversationTimestamp
              ? new Date(Number(chat.conversationTimestamp) * 1000)
              : null;

            return {
              updateOne: {
                filter: { userId, sessionId, chatJid: jid },
                update: {
                  $set: {
                    userId,
                    sessionId,
                    chatJid: jid,
                    phoneNumber: lidPhones.get(jid) || rawPhone || null,
                    contactName: contactName || null,
                    ...(lastMsgTimestamp
                      ? { lastMessageTime: lastMsgTimestamp }
                      : {}),
                  },
                  $setOnInsert: {
                    unreadCount: chat.unreadCount || 0,
                    lastMessage: "",
                  },
                },
                upsert: true,
              },
            };
          })
          .filter(Boolean);

        if (ops.length > 0) {
          await WaChat.bulkWrite(ops, { ordered: false });
          console.log(
            `[${sessionId}] Synced ${ops.length} chats from WhatsApp`,
          );
          if (io) {
            io.to(sessionId).emit("chat:synced", {
              sessionId,
              count: ops.length,
            });
          }
        }
      } catch (err) {
        console.error(`[${sessionId}] chats.upsert error:`, err.message);
      }
    });

    sock.ev.on("chats.update", async (updates) => {
      try {
        const session = await SessionModel.findOne({ sessionId });
        if (!session) return;
        for (const update of updates) {
          const jid = update.id;
          if (!jid || jid === "status@broadcast") return;
          const setFields = {};
          if (update.name) setFields.contactName = update.name;
          if (update.conversationTimestamp) {
            setFields.lastMessageTime = new Date(
              Number(update.conversationTimestamp) * 1000,
            );
          }
          if (Object.keys(setFields).length > 0) {
            await WaChat.updateOne(
              { userId: session.userId, sessionId, chatJid: jid },
              { $set: setFields },
            );
          }
        }
      } catch (err) {
        console.error(`[${sessionId}] chats.update error:`, err.message);
      }
    });

    // ── messages.upsert — new (notify) AND historical (append) messages ────────
    sock.ev.on("messages.upsert", async ({ messages: msgs, type }) => {
      // notify = new real-time message, append = history loaded on connect
      if (type !== "notify" && type !== "append") return;
      const isHistory = type === "append";

      try {
        const session = await SessionModel.findOne({ sessionId });
        if (!session) return;
        const userId = session.userId;

        for (const msg of msgs) {
          if (!msg.message) continue;
          const jid = msg.key.remoteJid;
          if (!jid || jid === "status@broadcast") continue;

          const isGroup = jid.endsWith("@g.us");
          const isFromMe = !!msg.key.fromMe;
          const rawPhone = lidPhones.get(jid) || rawPhoneFrom(jid);

          // Best available name
          const pushName = msg.pushName || "";
          const displayName =
            getDisplayName(jid) ||
            pushName ||
            (rawPhone && !jid.endsWith("@g.us") ? rawPhone : null) ||
            null;

          const msgContent =
            msg.message?.viewOnceMessage?.message ||
            msg.message?.viewOnceMessageV2?.message?.viewOnceMessage?.message ||
            msg.message;

          // NOTE: parentheses around ternary are required — || has higher precedence than ?:
          // without them, the entire || chain becomes the ternary condition
          const text =
            msgContent?.conversation ||
            msgContent?.extendedTextMessage?.text ||
            msgContent?.imageMessage?.caption ||
            msgContent?.videoMessage?.caption ||
            msgContent?.documentMessage?.caption ||
            msgContent?.documentMessage?.fileName ||
            (msgContent?.stickerMessage ? "[sticker]" : "") ||
            "";

          const mediaType = msgContent?.imageMessage
            ? "image"
            : msgContent?.videoMessage
              ? "video"
              : msgContent?.documentMessage
                ? "document"
                : msgContent?.audioMessage
                  ? "audio"
                  : msgContent?.stickerMessage
                    ? "sticker"
                    : null;

          const timestamp = msg.messageTimestamp
            ? new Date(Number(msg.messageTimestamp) * 1000)
            : new Date();

          const messageId = msg.key.id || `${Date.now()}-${Math.random()}`;

          // Upsert message (skip duplicates)
          try {
            await WaChatMessage.findOneAndUpdate(
              { messageId, sessionId },
              {
                userId,
                sessionId,
                chatJid: jid,
                messageId,
                text: text || "",
                direction: isFromMe ? "out" : "in",
                status: isFromMe ? "sent" : "read",
                mediaType,
                timestamp,
              },
              { upsert: true, new: true },
            );
          } catch (dupErr) {
            /* duplicate, skip */
          }

          // Update WaChat conversation metadata
          try {
            await WaChat.findOneAndUpdate(
              { userId, sessionId, chatJid: jid },
              {
                $set: {
                  userId,
                  sessionId,
                  chatJid: jid,
                  phoneNumber: rawPhone,
                  contactName: displayName,
                  lastMessage: text || (mediaType ? `[${mediaType}]` : ""),
                  lastMessageTime: timestamp,
                },
                $inc: { unreadCount: !isFromMe && !isHistory ? 1 : 0 },
              },
              { upsert: true, new: true },
            );
          } catch (chatErr) {
            console.error(
              `[${sessionId}] WaChat update error:`,
              chatErr.message,
            );
          }

          // Emit real-time event only for live messages (not history)
          if (!isHistory && io) {
            io.to(sessionId).emit("chat:message", {
              sessionId,
              chatJid: jid,
              phoneNumber: rawPhone,
              contactName: displayName,
              text,
              direction: isFromMe ? "out" : "in",
              mediaType,
              timestamp,
              messageId,
            });
          }

          // AI auto-reply — only for live, incoming, non-group text messages
          if (!isHistory && !isFromMe && !isGroup) {
            const realText = text && text !== "[sticker]" ? text : null;
            if (realText) {
              console.log(
                `[${sessionId}] 📨 Incoming message from ${jid}: "${realText.slice(0, 60)}" — checking AI agent`,
              );
              const sock = this.sockets.get(sessionId);
              handleIncomingMessage(
                sessionId,
                jid,
                realText,
                async (recipientJid, replyText) => {
                  if (!sock) {
                    console.error(
                      `[${sessionId}] AI send failed: socket not found`,
                    );
                    return;
                  }
                  try {
                    await sock.sendMessage(recipientJid, { text: replyText });
                    console.log(
                      `[${sessionId}] 📤 AI reply sent to ${recipientJid}`,
                    );
                  } catch (sendErr) {
                    console.error(
                      `[${sessionId}] AI send error:`,
                      sendErr.message,
                    );
                  }
                },
              );

              // Execute flows for incoming message
              const flowRecipient = rawPhone || jid;
              if (flowRecipient) {
                executeFlowOnMessage(
                  sessionId,
                  flowRecipient,
                  realText,
                  userId,
                ).catch((err) => {
                  console.error(
                    `[${sessionId}] Flow execution error:`,
                    err.message,
                  );
                });
              }
            }
          }
        }

        // After bulk history append, notify frontend to refresh chat list
        if (isHistory && msgs.length > 0 && io) {
          io.to(sessionId).emit("chat:synced", { sessionId });
        }
      } catch (err) {
        console.error(`[${sessionId}] messages.upsert error:`, err.message);
      }
    });

    // ── messaging-history.set — fires on every connect with FULL history ─────
    // This is the most reliable way to get all chats because it fires even on
    // sessions that were already connected before the chats.upsert handler existed.
    sock.ev.on(
      "messaging-history.set",
      async ({
        chats: histChats = [],
        contacts: histContacts = [],
        messages: histMsgs = [],
      }) => {
        try {
          const session = await SessionModel.findOne({ sessionId });
          if (!session) return;
          const userId = session.userId;

          // Update contact name map from history contacts
          for (const c of histContacts) {
            const name = c.name || c.notify || c.verifiedName || "";
            if (c.id && name) contactNames.set(c.id, name);
            if (c.id && c.id.endsWith("@lid") && c.phoneNumber) {
              lidPhones.set(c.id, c.phoneNumber.replace(/\D/g, ""));
            }
          }

          // Bulk-upsert all chats from history
          if (histChats.length > 0) {
            const ops = histChats
              .map((chat) => {
                const jid = chat.id;
                if (!jid || jid === "status@broadcast") return null;
                const rawPhone = lidPhones.get(jid) || rawPhoneFrom(jid);
                const name = chat.name || contactNames.get(jid) || null;
                const lastTs = chat.conversationTimestamp
                  ? new Date(Number(chat.conversationTimestamp) * 1000)
                  : null;
                return {
                  updateOne: {
                    filter: { userId, sessionId, chatJid: jid },
                    update: {
                      $set: {
                        userId,
                        sessionId,
                        chatJid: jid,
                        phoneNumber: rawPhone || null,
                        contactName: name || null,
                        ...(lastTs ? { lastMessageTime: lastTs } : {}),
                      },
                      $setOnInsert: {
                        unreadCount: chat.unreadCount || 0,
                        lastMessage: "",
                      },
                    },
                    upsert: true,
                  },
                };
              })
              .filter(Boolean);

            if (ops.length > 0) {
              await WaChat.bulkWrite(ops, { ordered: false });
              console.log(
                `[${sessionId}] messaging-history.set: saved ${ops.length} chats`,
              );
            }
          }

          // Save recent messages from history
          for (const msg of histMsgs) {
            if (!msg.message) continue;
            const jid = msg.key?.remoteJid;
            if (!jid || jid === "status@broadcast") continue;
            const isFromMe = !!msg.key.fromMe;
            const rawPhone = lidPhones.get(jid) || rawPhoneFrom(jid);
            const msgContent =
              msg.message?.viewOnceMessage?.message || msg.message;
            const text =
              msgContent?.conversation ||
              msgContent?.extendedTextMessage?.text ||
              msgContent?.imageMessage?.caption ||
              msgContent?.videoMessage?.caption ||
              msgContent?.documentMessage?.caption ||
              "";
            const mediaType = msgContent?.imageMessage
              ? "image"
              : msgContent?.videoMessage
                ? "video"
                : msgContent?.documentMessage
                  ? "document"
                  : msgContent?.audioMessage
                    ? "audio"
                    : null;
            const timestamp = msg.messageTimestamp
              ? new Date(Number(msg.messageTimestamp) * 1000)
              : new Date();
            const messageId = msg.key.id;
            if (!messageId) continue;

            try {
              await WaChatMessage.findOneAndUpdate(
                { messageId, sessionId },
                {
                  userId,
                  sessionId,
                  chatJid: jid,
                  messageId,
                  text: text || "",
                  direction: isFromMe ? "out" : "in",
                  status: "read",
                  mediaType,
                  timestamp,
                },
                { upsert: true, new: true },
              );
              // Update last message on WaChat if this is newer
              if (text || mediaType) {
                await WaChat.updateOne(
                  {
                    userId,
                    sessionId,
                    chatJid: jid,
                    $or: [
                      { lastMessageTime: { $lt: timestamp } },
                      { lastMessageTime: null },
                    ],
                  },
                  {
                    $set: {
                      lastMessage: text || `[${mediaType}]`,
                      lastMessageTime: timestamp,
                      phoneNumber: rawPhone,
                    },
                  },
                );
              }
            } catch (_) {
              /* duplicate */
            }
          }

          // Notify frontend that sync is complete
          if (io) {
            io.to(sessionId).emit("chat:synced", {
              sessionId,
              count: histChats.length,
            });
          }
          console.log(
            `[${sessionId}] History sync complete — ${histChats.length} chats, ${histMsgs.length} messages`,
          );
        } catch (err) {
          console.error(
            `[${sessionId}] messaging-history.set error:`,
            err.message,
          );
        }
      },
    );

    // Listen for message updates (delivery, read status)
    sock.ev.on("messages.update", async (updates) => {
      for (const { key, update } of updates) {
        try {
          const remoteJid = key?.remoteJid || "";
          const participantJid = key?.participant || "";
          const phoneNumber =
            remoteJid.split("@")[0] || participantJid.split("@")[0] || "";
          if (!phoneNumber) continue;
          const messageStatus = update.status;

          let status = "pending";
          let updateData = {};

          // Map Baileys status codes to our status
          // 1: pending, 2: sent, 3: delivered, 4: read
          if (messageStatus === 2) {
            status = "sent";
          } else if (messageStatus === 3) {
            status = "delivered";
            updateData.deliveredAt = new Date();
          } else if (messageStatus === 4) {
            status = "read";
            updateData.readAt = new Date();
          }

          // Update message in database
          const session = await SessionModel.findOne({ sessionId });
          if (session) {
            await Message.findOneAndUpdate(
              {
                sessionId: session._id,
                phoneNumber: phoneNumber,
                status: { $ne: "read" }, // Don't overwrite if already read
              },
              {
                status,
                ...updateData,
              },
              { sort: { sentAt: -1 } }, // Update most recent message first
            );

            // Emit status update through Socket.IO
            if (io) {
              io.emit("message:status-update", {
                sessionId,
                phoneNumber,
                status,
                ...updateData,
              });
            }

            console.log(
              `[${sessionId}] Message status updated: ${phoneNumber} -> ${status}`,
            );
          }
        } catch (err) {
          console.error("Error updating message status:", err.message);
        }
      }
    });

    return sock;
  }

  async createSession(userId, name, options = {}) {
    const { enableChatView = false, chatPasscode = "" } = options;
    const sessionId = `wa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Save to DB first
    const sessionDb = new SessionModel({
      userId: new mongoose.Types.ObjectId(userId),
      name,
      sessionId,
      status: "connecting",
      credentials: {},
      chatViewEnabled: !!enableChatView,
      chatPasscodeHash:
        enableChatView && String(chatPasscode).length >= 4
          ? await bcrypt.hash(String(chatPasscode), 10)
          : null,
    });

    await sessionDb.save();

    // Create session folder
    const sessionPath = join(SESSIONS_DIR, sessionId);
    if (!existsSync(sessionPath)) {
      mkdirSync(sessionPath, { recursive: true });
    }

    // Get auth state
    const authState = await useMultiFileAuthState(sessionPath);

    // Create socket
    const sock = await this.createSocket(sessionId, authState);
    this.sockets.set(sessionId, sock);

    if (this.io) {
      this.io.to(sessionId).emit("session:created", { sessionId, name });
    }

    return {
      sessionId,
      name,
      status: "connecting",
      chatViewEnabled: !!enableChatView,
    };
  }

  async reconnectSession(sessionId) {
    // Guard: skip if a reconnect is already in progress for this session
    if (this.pendingReconnects.has(sessionId)) {
      console.log(`[${sessionId}] Reconnect already in progress, skipping`);
      return;
    }
    this.pendingReconnects.add(sessionId);

    try {
      const session = await SessionModel.findOne({ sessionId });
      if (!session) {
        console.log(`[${sessionId}] Session not found for reconnect`);
        return;
      }

      if (this.sockets.has(sessionId)) {
        try {
          this.sockets
            .get(sessionId)
            .end({ error: null, reason: "Reconnecting" });
        } catch (e) {}
        this.sockets.delete(sessionId);
      }

      const sessionPath = join(SESSIONS_DIR, sessionId);
      const authState = await useMultiFileAuthState(sessionPath);
      const sock = await this.createSocket(sessionId, authState);
      this.sockets.set(sessionId, sock);

      await SessionModel.updateOne({ sessionId }, { status: "connecting" });

      return { sessionId, status: "connecting" };
    } finally {
      this.pendingReconnects.delete(sessionId);
    }
  }

  async restoreSessions() {
    try {
      // Include "disconnected" sessions too — they may have been incorrectly marked
      // as disconnected (network glitch, server crash) but still have valid creds on disk.
      const sessions = await SessionModel.find({
        status: { $in: ["connecting", "connected", "disconnected"] },
      });

      for (const session of sessions) {
        try {
          const sessionPath = join(SESSIONS_DIR, session.sessionId);
          const credsPath = join(sessionPath, "creds.json");

          if (!existsSync(credsPath)) {
            if (session.status !== "disconnected") {
              console.log(
                `Skipping restore for ${session.sessionId}: creds.json missing`,
              );
              await SessionModel.updateOne(
                { sessionId: session.sessionId },
                { status: "disconnected" },
              );
            }
            continue;
          }

          // Skip if socket already exists in map (shouldn't happen at startup)
          if (this.sockets.has(session.sessionId)) continue;

          console.log(
            `Restoring session: ${session.sessionId} (prev status: ${session.status})`,
          );
          const authState = await useMultiFileAuthState(sessionPath);
          const sock = await this.createSocket(session.sessionId, authState);
          this.sockets.set(session.sessionId, sock);
          // Mark as connecting now; event handler will set "connected" when open
          await SessionModel.updateOne(
            { sessionId: session.sessionId },
            { status: "connecting" },
          );
        } catch (err) {
          console.error(`Failed to restore ${session.sessionId}:`, err.message);
        }
      }
    } catch (err) {
      console.error("Restore sessions error:", err.message);
    }
  }

  async getSession(sessionId) {
    return this.sockets.get(sessionId);
  }

  // Returns the live socket for a session (for chat history fetch)
  getSocket(sessionId) {
    return this.sockets.get(sessionId) || null;
  }

  // Fetch recent message history for a specific chat JID via Baileys
  async loadChatHistory(sessionId, jid, count = 50) {
    const sock = this.sockets.get(sessionId);
    if (!sock) throw new Error("Session not connected");
    try {
      // loadMessages is available in @whiskeysockets/baileys and returns from internal store
      const result = await sock.loadMessages(jid, count);
      return result?.messages || [];
    } catch (err) {
      console.warn(`[${sessionId}] loadChatHistory for ${jid}:`, err.message);
      return [];
    }
  }

  async waitForSocketOpen(sock, timeoutMs = 15000) {
    if (sock?.user?.id) {
      return;
    }

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Session reconnect timeout"));
      }, timeoutMs);

      const onUpdate = (update) => {
        if (update.connection === "open") {
          cleanup();
          resolve();
        } else if (update.connection === "close") {
          cleanup();
          reject(new Error("Session closed while reconnecting"));
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        sock.ev.off("connection.update", onUpdate);
      };

      sock.ev.on("connection.update", onUpdate);
    });
  }

  async sendMessage(
    sessionId,
    phoneNumber,
    message,
    mediaPath = null,
    mediaType = null,
  ) {
    if (!phoneNumber) {
      throw new Error("Recipient phone number/JID is required");
    }

    let sock = this.sockets.get(sessionId);
    if (!sock) {
      console.log(
        `[${sessionId}] Socket missing during send, trying reconnect...`,
      );
      await this.reconnectSession(sessionId);
      sock = this.sockets.get(sessionId);
    }

    if (!sock) {
      throw new Error("Session not connected");
    }

    await this.waitForSocketOpen(sock);

    // If a full JID was passed (contains @), use it directly — handles @s.whatsapp.net, @g.us, @lid
    let jid;
    if (String(phoneNumber).includes("@")) {
      jid = phoneNumber;
    } else {
      jid = String(phoneNumber).replace(/\D/g, "");
      if (jid.length === 10) jid = "91" + jid;
      jid = jid + "@s.whatsapp.net";
    }

    if (jid === "@s.whatsapp.net") {
      throw new Error("Invalid recipient JID");
    }

    // If media is provided, send media with optional caption
    if (mediaPath && mediaType) {
      try {
        const fs = await import("fs");
        const path = await import("path");

        // Get file size
        const fileSize = fs.statSync(mediaPath).size;

        // Check file size limit (100MB)
        if (fileSize > 100 * 1024 * 1024) {
          throw new Error("File size exceeds 100MB limit");
        }

        // Prepare media object based on type
        let mediaObj = {};

        if (mediaType.startsWith("image/")) {
          mediaObj.image = fs.readFileSync(mediaPath);
          if (message) mediaObj.caption = message;
        } else if (mediaType.startsWith("video/")) {
          mediaObj.video = fs.readFileSync(mediaPath);
          if (message) mediaObj.caption = message;
        } else if (mediaType.startsWith("audio/")) {
          mediaObj.audio = fs.readFileSync(mediaPath);
          // Audio doesn't support captions in WhatsApp
        } else if (
          mediaType === "application/pdf" ||
          mediaType.includes("document")
        ) {
          mediaObj.document = fs.readFileSync(mediaPath);
          mediaObj.mimetype = mediaType;
          const fileName = path.basename(mediaPath);
          mediaObj.fileName = fileName;
          if (message) mediaObj.caption = message;
        } else {
          // Generic file/document
          mediaObj.document = fs.readFileSync(mediaPath);
          mediaObj.mimetype = mediaType;
          const fileName = path.basename(mediaPath);
          mediaObj.fileName = fileName;
          if (message) mediaObj.caption = message;
        }

        await sock.sendMessage(jid, mediaObj);
      } catch (err) {
        console.error(`[${sessionId}] Media send error:`, err.message);
        throw new Error(`Failed to send media: ${err.message}`);
      }
    } else {
      // Send text-only message
      await sock.sendMessage(jid, { text: message });
    }

    return { success: true, phoneNumber };
  }

  async logoutSession(sessionId) {
    const sock = this.sockets.get(sessionId);
    if (sock) {
      try {
        await sock.logout();
      } catch (e) {}
      this.sockets.delete(sessionId);
    }

    await this.removeSessionFiles(sessionId);

    await SessionModel.updateOne(
      { sessionId },
      { status: "disconnected", credentials: {} },
    );

    if (this.io) {
      this.io.to(sessionId).emit("status", { sessionId, status: "logged_out" });
    }

    return { success: true };
  }

  async deleteSession(sessionId) {
    const sock = this.sockets.get(sessionId);
    if (sock) {
      try {
        sock.end({ error: null, reason: "Session deleted" });
      } catch (e) {}
      this.sockets.delete(sessionId);
    }

    await this.removeSessionFiles(sessionId);
    await SessionModel.deleteOne({ sessionId });

    return { success: true };
  }

  getPendingQR(sessionId) {
    return this.pendingQRCodes.get(sessionId) || null;
  }

  async getSessionStatus(sessionId) {
    const session = await SessionModel.findOne({ sessionId });
    if (!session) return null;

    const sock = this.sockets.get(sessionId);
    const isLiveConnected = !!sock?.user?.id;

    // 1. Socket is alive but DB is stale → sync DB silently and return "connected"
    if (isLiveConnected && session.status !== "connected") {
      const phone = (sock.user.id || "").split("@")[0].split(":")[0];
      SessionModel.updateOne(
        { sessionId },
        { status: "connected", ...(phone ? { phoneNumber: phone } : {}) },
      ).catch(console.error);
      return {
        sessionId: session.sessionId,
        name: session.name,
        status: "connected",
        phoneNumber: phone || session.phoneNumber,
        lastConnected: session.lastConnected,
      };
    }

    // 2. DB says connected/connecting but socket is gone → trigger recovery
    if (
      !isLiveConnected &&
      ["connected", "connecting"].includes(session.status)
    ) {
      const credsPath = join(SESSIONS_DIR, sessionId, "creds.json");
      if (existsSync(credsPath)) {
        console.log(
          `[${sessionId}] Socket missing for ${session.status} session — triggering reconnect`,
        );
        this.reconnectSession(sessionId).catch(console.error);
        return {
          sessionId: session.sessionId,
          name: session.name,
          status: "connecting",
          phoneNumber: session.phoneNumber,
          lastConnected: session.lastConnected,
        };
      }
    }

    // 3. DB says disconnected but creds exist → auto-reconnect (e.g. after server restart
    //    that skipped the session, or after an incorrect disconnect marking)
    if (!isLiveConnected && session.status === "disconnected") {
      const credsPath = join(SESSIONS_DIR, sessionId, "creds.json");
      if (existsSync(credsPath)) {
        console.log(
          `[${sessionId}] Disconnected but creds exist — auto-reconnecting`,
        );
        SessionModel.updateOne({ sessionId }, { status: "connecting" }).catch(
          console.error,
        );
        this.reconnectSession(sessionId).catch(console.error);
        return {
          sessionId: session.sessionId,
          name: session.name,
          status: "connecting",
          phoneNumber: session.phoneNumber,
          lastConnected: session.lastConnected,
        };
      }
    }

    return {
      sessionId: session.sessionId,
      name: session.name,
      status: session.status,
      phoneNumber: session.phoneNumber,
      lastConnected: session.lastConnected,
    };
  }

  /**
   * Emit session status update to ALL connected sockets of a user.
   * This ensures real-time sync across all browser tabs/devices.
   * Uses user room (user:${userId}) instead of session room.
   */
  async emitSessionUpdate(sessionId, statusInfo) {
    if (!this.io) return;

    try {
      const session = await SessionModel.findOne({ sessionId });
      if (!session) return;

      const userId = session.userId.toString();
      const timestamp = new Date().toISOString();

      const updatePayload = {
        sessionId,
        name: session.name,
        status: statusInfo.status || session.status,
        phoneNumber: statusInfo.phoneNumber || session.phoneNumber,
        lastConnected: statusInfo.lastConnected || session.lastConnected,
        lastUpdated: timestamp,
      };

      // Broadcast to user room (all client instances receive this)
      this.io.to(`user:${userId}`).emit("session:update", updatePayload);

      console.log(`[${sessionId}] Emitted session:update to user:${userId}`, {
        status: updatePayload.status,
        timestamp,
      });
    } catch (err) {
      console.error(`[${sessionId}] emitSessionUpdate error:`, err.message);
    }
  }
}

export default new WhatsAppService();
