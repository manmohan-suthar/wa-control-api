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
    this.pendingQRCodes = new Map();
    this.reconnectAttempts = new Map();
    this.pendingReconnects = new Set();
    this.heartbeats = new Map();

    if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
  }

  setSocketIO(io) {
    this.io = io;
  }

  clearHeartbeat(sessionId) {
    const t = this.heartbeats.get(sessionId);
    if (t) clearInterval(t);
    this.heartbeats.delete(sessionId);
  }

  startHeartbeat(sessionId, sock) {
    this.clearHeartbeat(sessionId);
    const id = setInterval(() => {
      try {
        if (sock && sock.user && sock.user.id) {
          sock.sendPresence?.("available").catch(() => {});
        }
      } catch (_) {}
    }, 30_000);
    this.heartbeats.set(sessionId, id);
  }

  async getSocketVersion() {
    try {
      const { version } = await fetchLatestBaileysVersion();
      return version;
    } catch (e) {
      return undefined;
    }
  }

  async removeSessionFiles(sessionId) {
    const sessionPath = join(SESSIONS_DIR, sessionId);
    try {
      if (existsSync(sessionPath)) {
        // wipe cred files safely
        const files = ["creds.json", "keys.json"];
        for (const f of files) {
          try {
            writeFileSync(join(sessionPath, f), JSON.stringify({}));
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  // Core socket factory + event handlers
  async createSocket(sessionId, authState) {
    const io = this.io;
    let isLoggingOut = false;
    let hasGeneratedQR = false;

    const version = await this.getSocketVersion();
    const sock = makeWASocket({
      auth: authState.state,
      version,
      printQRInTerminal: false,
      browser: Browsers.ubuntu("Chrome"),
      markOnlineOnConnect: false,
    });

    // Save creds when updated
    sock.ev.on("creds.update", authState.saveCreds);

    // QR handling
    sock.ev.on("connection.update", async (update) => {
      const { qr, connection, lastDisconnect } = update;
      if (qr) {
        hasGeneratedQR = true;
        try {
          qrcode.toDataURL(qr, (err, url) => {
            if (!err && url) {
              this.pendingQRCodes.set(sessionId, url);
              if (io) {
                io.to(sessionId).emit("qrcode", { sessionId, qr: url });
                io.to(sessionId).emit("status", { sessionId, status: "qr" });
              }
            }
          });
        } catch (e) {}
      }

      if (connection === "open") {
        // Mark connected
        const phone = (sock.user?.id || "").split("@")[0].split(":")[0];
        this.pendingQRCodes.delete(sessionId);
        this.reconnectAttempts.delete(sessionId);
        this.sockets.set(sessionId, sock);
        await SessionModel.updateOne(
          { sessionId },
          {
            status: "connected",
            phoneNumber: phone,
            lastConnected: new Date(),
          },
        ).catch(() => {});
        if (io)
          io.to(sessionId).emit("status", {
            sessionId,
            status: "connected",
            phoneNumber: phone,
          });
        this.startHeartbeat(sessionId, sock);
      }

      if (connection === "close") {
        if (isLoggingOut) {
          this.clearHeartbeat(sessionId);
          return;
        }

        const statusCode = lastDisconnect?.error?.output?.statusCode ?? null;
        const reason =
          statusCode ??
          (lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output.statusCode
            : 0);
        const isLogout =
          statusCode === 401 || reason === DisconnectReason.loggedOut;
        const isRestartRequired = reason === DisconnectReason.restartRequired;
        const isRegistered = !!authState.state.creds?.registered;
        const attempts = this.reconnectAttempts.get(sessionId) || 0;

        this.clearHeartbeat(sessionId);

        if (isLogout) {
          await SessionModel.updateOne(
            { sessionId },
            { status: "disconnected" },
          ).catch(() => {});
          if (io)
            io.to(sessionId).emit("status", {
              sessionId,
              status: "disconnected",
            });
          this.emitSessionUpdate(sessionId, { status: "disconnected" });
          this.sockets.delete(sessionId);
          return;
        }

        // Temporary disconnects: mark connecting and attempt reconnect
        if (isRestartRequired || isRegistered) {
          this.sockets.delete(sessionId);
          await SessionModel.updateOne(
            { sessionId },
            { status: "connecting" },
          ).catch(() => {});
          if (io)
            io.to(sessionId).emit("status", {
              sessionId,
              status: "connecting",
            });
          setTimeout(
            () => this.reconnectSession(sessionId).catch(() => {}),
            3000,
          );
          return;
        }

        // Pre-auth flows: don't wipe creds if QR already issued; try a quick reconnect
        if (!isRegistered && hasGeneratedQR) {
          this.sockets.delete(sessionId);
          setTimeout(
            () => this.reconnectSession(sessionId).catch(() => {}),
            2500,
          );
          return;
        }

        // Try a limited auth reset for fresh sessions
        if (!isRegistered && attempts < 2) {
          this.reconnectAttempts.set(sessionId, attempts + 1);
          this.sockets.delete(sessionId);
          try {
            const sessionPath = join(SESSIONS_DIR, sessionId);
            rmSync(sessionPath, { recursive: true, force: true });
            mkdirSync(sessionPath, { recursive: true });
          } catch (e) {}
          setTimeout(
            () => this.reconnectSession(sessionId).catch(() => {}),
            1500,
          );
          return;
        }

        // If creds exist, schedule a recovery reconnect; otherwise mark disconnected
        const credsPath = join(SESSIONS_DIR, sessionId, "creds.json");
        if (existsSync(credsPath)) {
          await SessionModel.updateOne(
            { sessionId },
            { status: "connecting" },
          ).catch(() => {});
          if (io)
            io.to(sessionId).emit("status", {
              sessionId,
              status: "connecting",
            });
          setTimeout(() => {
            if (!this.sockets.has(sessionId)) {
              this.reconnectSession(sessionId).catch(() => {
                SessionModel.updateOne(
                  { sessionId },
                  { status: "disconnected" },
                ).catch(() => {});
                if (io)
                  io.to(sessionId).emit("status", {
                    sessionId,
                    status: "disconnected",
                  });
              });
            }
          }, 15_000);
        } else {
          await SessionModel.updateOne(
            { sessionId },
            { status: "disconnected" },
          ).catch(() => {});
          if (io)
            io.to(sessionId).emit("status", {
              sessionId,
              status: "disconnected",
            });
        }
      }
    });

    // Basic message and contact handlers can be added here as needed.

    return sock;
  }

  async createSession(userId, name, options = {}) {
    const { enableChatView = false, chatPasscode = "" } = options;
    const sessionId = `wa_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const sessionDb = new SessionModel({
      userId: new mongoose.Types.ObjectId(userId),
      name,
      sessionId,
      status: "connecting",
      credentials: {},
      chatViewEnabled: !!enableChatView,
    });
    await sessionDb.save();

    const sessionPath = join(SESSIONS_DIR, sessionId);
    if (!existsSync(sessionPath)) mkdirSync(sessionPath, { recursive: true });

    const authState = await useMultiFileAuthState(sessionPath);
    const sock = await this.createSocket(sessionId, authState);
    this.sockets.set(sessionId, sock);

    if (this.io)
      this.io.to(sessionId).emit("session:created", { sessionId, name });

    return { sessionId, name, status: "connecting" };
  }

  async reconnectSession(sessionId) {
    if (this.pendingReconnects.has(sessionId)) return;
    this.pendingReconnects.add(sessionId);
    try {
      const session = await SessionModel.findOne({ sessionId });
      if (!session) return;

      if (this.sockets.has(sessionId)) {
        try {
          this.sockets.get(sessionId).end({ reason: "reconnect" });
        } catch (e) {}
        this.sockets.delete(sessionId);
      }

      const sessionPath = join(SESSIONS_DIR, sessionId);
      const authState = await useMultiFileAuthState(sessionPath);
      const sock = await this.createSocket(sessionId, authState);
      this.sockets.set(sessionId, sock);
      await SessionModel.updateOne(
        { sessionId },
        { status: "connecting" },
      ).catch(() => {});
      return { sessionId, status: "connecting" };
    } finally {
      this.pendingReconnects.delete(sessionId);
    }
  }

  async restoreSessions() {
    try {
      const sessions = await SessionModel.find({
        status: { $in: ["connecting", "connected", "disconnected"] },
      });
      for (const s of sessions) {
        try {
          const sessionPath = join(SESSIONS_DIR, s.sessionId);
          const credsPath = join(sessionPath, "creds.json");
          if (!existsSync(credsPath)) {
            await SessionModel.updateOne(
              { sessionId: s.sessionId },
              { status: "disconnected" },
            ).catch(() => {});
            continue;
          }
          if (this.sockets.has(s.sessionId)) continue;
          const authState = await useMultiFileAuthState(sessionPath);
          const sock = await this.createSocket(s.sessionId, authState);
          this.sockets.set(s.sessionId, sock);
          await SessionModel.updateOne(
            { sessionId: s.sessionId },
            { status: "connecting" },
          ).catch(() => {});
        } catch (e) {}
      }
    } catch (e) {}
  }

  getPendingQR(sessionId) {
    return this.pendingQRCodes.get(sessionId) || null;
  }

  async getSessionStatus(sessionId) {
    const session = await SessionModel.findOne({ sessionId });
    if (!session) return null;
    const sock = this.sockets.get(sessionId);
    const isLiveConnected = !!sock?.user?.id;

    if (isLiveConnected && session.status !== "connected") {
      const phone = (sock.user.id || "").split("@")[0].split(":")[0];
      SessionModel.updateOne(
        { sessionId },
        { status: "connected", phoneNumber: phone },
      ).catch(() => {});
      return {
        sessionId: session.sessionId,
        name: session.name,
        status: "connected",
        phoneNumber: phone,
      };
    }

    if (
      !isLiveConnected &&
      ["connected", "connecting"].includes(session.status)
    ) {
      const credsPath = join(SESSIONS_DIR, sessionId, "creds.json");
      if (existsSync(credsPath)) {
        this.reconnectSession(sessionId).catch(() => {});
        return {
          sessionId: session.sessionId,
          name: session.name,
          status: "connecting",
          phoneNumber: session.phoneNumber,
        };
      }
    }

    if (!isLiveConnected && session.status === "disconnected") {
      const credsPath = join(SESSIONS_DIR, sessionId, "creds.json");
      if (existsSync(credsPath)) {
        SessionModel.updateOne({ sessionId }, { status: "connecting" }).catch(
          () => {},
        );
        this.reconnectSession(sessionId).catch(() => {});
        return {
          sessionId: session.sessionId,
          name: session.name,
          status: "connecting",
          phoneNumber: session.phoneNumber,
        };
      }
    }

    return {
      sessionId: session.sessionId,
      name: session.name,
      status: session.status,
      phoneNumber: session.phoneNumber,
    };
  }

  async emitSessionUpdate(sessionId, statusInfo) {
    if (!this.io) return;
    try {
      const session = await SessionModel.findOne({ sessionId });
      if (!session) return;
      const userId = session.userId.toString();
      const payload = {
        sessionId,
        name: session.name,
        status: statusInfo.status || session.status,
        phoneNumber: statusInfo.phoneNumber || session.phoneNumber,
        lastConnected: statusInfo.lastConnected || session.lastConnected,
      };
      this.io.to(`user:${userId}`).emit("session:update", payload);
    } catch (e) {}
  }

  async logoutSession(sessionId) {
    const sock = this.sockets.get(sessionId);
    if (sock) {
      try {
        await sock.logout();
      } catch (e) {}
      this.sockets.delete(sessionId);
      this.clearHeartbeat(sessionId);
    }
    await this.removeSessionFiles(sessionId);
    await SessionModel.updateOne(
      { sessionId },
      { status: "disconnected", credentials: {} },
    ).catch(() => {});
    if (this.io)
      this.io.to(sessionId).emit("status", { sessionId, status: "logged_out" });
    return { success: true };
  }

  async deleteSession(sessionId) {
    const sock = this.sockets.get(sessionId);
    if (sock) {
      try {
        sock.end({ error: null, reason: "Session deleted" });
      } catch (e) {}
      this.sockets.delete(sessionId);
      this.clearHeartbeat(sessionId);
    }
    await this.removeSessionFiles(sessionId);
    await SessionModel.deleteOne({ sessionId }).catch(() => {});
    return { success: true };
  }
}

export default new WhatsAppService();
