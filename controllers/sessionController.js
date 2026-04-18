import { WhatsAppSession } from "../models/index.js";
import WhatsAppService from "../services/WhatsAppService.js";
import mongoose from "mongoose";
import SubscriptionService from "../services/SubscriptionService.js";
import { sendSubscriptionError } from "../utils/subscription.js";

export const createSession = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Session name is required" });
    }

    await SubscriptionService.assertResourceLimit(req.user, "sessions", 1);

    console.log("Creating session for user:", req.user?._id, "name:", name);
    const result = await WhatsAppService.createSession(req.user._id, name);

    res.status(201).json(result);
  } catch (err) {
    console.error("Create session error:", err);
    return sendSubscriptionError(res, err, "Failed to create session");
  }
};

export const listSessions = async (req, res) => {
  try {
    const sessions = await WhatsAppSession.find({ userId: req.user._id })
      .select("-credentials")
      .sort({ createdAt: -1 });

    const sessionsWithStatus = await Promise.all(
      sessions.map(async (session) => {
        const statusInfo = await WhatsAppService.getSessionStatus(
          session.sessionId,
        );
        return {
          _id: session._id,
          sessionId: session.sessionId,
          name: session.name,
          status: statusInfo?.status || session.status,
          phone: session.phoneNumber,
          phoneNumber: session.phoneNumber,
          lastConnected: session.lastConnected,
          createdAt: session.createdAt,
        };
      }),
    );

    res.json({ success: true, data: sessionsWithStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getSession = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    }).select("-credentials");

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const statusInfo = await WhatsAppService.getSessionStatus(id);

    res.json({
      sessionId: session.sessionId,
      name: session.name,
      status: statusInfo?.status || session.status,
      phoneNumber: session.phoneNumber,
      lastConnected: session.lastConnected,
      createdAt: session.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteSession = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    await WhatsAppService.deleteSession(id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getSessionQR = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const qrCode = WhatsAppService.getPendingQR(id);

    if (!qrCode) {
      return res.status(404).json({ error: "QR code not available" });
    }

    res.json({ qr: qrCode, sessionId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const logoutSession = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    await WhatsAppService.logoutSession(id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default {
  createSession,
  listSessions,
  getSession,
  getSessionQR,
  deleteSession,
  logoutSession,
};
