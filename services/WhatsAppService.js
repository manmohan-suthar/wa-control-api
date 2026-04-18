import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import mongoose from "mongoose";
import * as qrcode from "qrcode";
import { writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { WhatsAppSession as SessionModel, Message } from "../models/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SESSIONS_DIR = join(__dirname, "..", "sessions");

class WhatsAppService {
  constructor() {
    this.sockets = new Map();
    this.io = null;
    this.pendingQRCodes = new Map(); // sessionId -> latest QR data URL (race condition fix)
    this.reconnectAttempts = new Map();

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
        } else {
          SessionModel.updateOne(
            { sessionId },
            { status: "disconnected" },
          ).catch(console.error);

          if (io) {
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

    // Listen for message updates (delivery, read status)
    sock.ev.on("messages.update", async (updates) => {
      for (const { key, update } of updates) {
        try {
          const phoneNumber = key.remoteJid.split("@")[0];
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
              { sort: { sentAt: -1 } } // Update most recent message first
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

            console.log(`[${sessionId}] Message status updated: ${phoneNumber} -> ${status}`);
          }
        } catch (err) {
          console.error("Error updating message status:", err.message);
        }
      }
    });

    return sock;
  }

  async createSession(userId, name) {
    const sessionId = `wa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Save to DB first
    const sessionDb = new SessionModel({
      userId: new mongoose.Types.ObjectId(userId),
      name,
      sessionId,
      status: "connecting",
      credentials: {},
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
    };
  }

  async reconnectSession(sessionId) {
    // Find session in DB
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

    // Get auth state
    const authState = await useMultiFileAuthState(sessionPath);

    const sock = await this.createSocket(sessionId, authState);
    this.sockets.set(sessionId, sock);

    await SessionModel.updateOne({ sessionId }, { status: "connecting" });

    return { sessionId, status: "connecting" };
  }

  async restoreSessions() {
    try {
      const sessions = await SessionModel.find({
        status: { $in: ["connecting", "connected"] },
      });

      for (const session of sessions) {
        try {
          const sessionPath = join(SESSIONS_DIR, session.sessionId);
          const credsPath = join(sessionPath, "creds.json");

          if (!existsSync(credsPath)) {
            console.log(
              `Skipping restore for ${session.sessionId}: creds.json missing`,
            );
            await SessionModel.updateOne(
              { sessionId: session.sessionId },
              { status: "disconnected" },
            );
            continue;
          }

          console.log(`Restoring session: ${session.sessionId}`);
          const authState = await useMultiFileAuthState(sessionPath);
          const sock = await this.createSocket(session.sessionId, authState);
          this.sockets.set(session.sessionId, sock);
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

    let jid = phoneNumber.replace(/\D/g, "");
    if (jid.length === 10) {
      jid = "91" + jid;
    }
    if (!jid.includes("@s.whatsapp.net")) {
      jid = jid + "@s.whatsapp.net";
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
    if (!session) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      name: session.name,
      status: session.status,
      phoneNumber: session.phoneNumber,
      lastConnected: session.lastConnected,
    };
  }
}

export default new WhatsAppService();
