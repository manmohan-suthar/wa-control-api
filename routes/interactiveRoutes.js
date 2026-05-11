/**
 * Interactive Messages Routes
 *
 * Unified endpoint for all WhatsApp interactive message types
 */

import express from "express";
import {
  sendInteractiveMessage,
  getMessageTypes,
} from "../controllers/interactiveController.js";

const router = express.Router();

/**
 * POST /interactive
 *
 * Send interactive message (quick reply, CTA, list, native flow, etc.)
 *
 * Request body:
 * {
 *   "sessionId": "wa_123",
 *   "to": "918888888888",
 *   "type": "quick_reply|cta_url|cta_call|list|native_flow|carousel|webview|payment",
 *   "data": { ... type-specific data ... }
 * }
 */
router.post("/interactive", sendInteractiveMessage);

/**
 * GET /interactive/types
 *
 * Get list of supported interactive message types
 */
router.get("/interactive/types", getMessageTypes);

export default router;
