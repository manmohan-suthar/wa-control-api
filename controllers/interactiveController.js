/**
 * Interactive Messages Controller
 *
 * Universal handler for all WhatsApp interactive message types
 * Routes requests to appropriate service based on message type
 */

import { getSessionSocket } from "../services/WhatsAppService.js";

// Import all interactive message services
import { sendQuickReply } from "../services/interactive/quickReply.js";
import { sendCTAUrl } from "../services/interactive/ctaUrl.js";
import { sendCTACall } from "../services/interactive/ctaCall.js";
import { sendListMessage } from "../services/interactive/listMessage.js";
import { sendNativeFlow } from "../services/interactive/nativeFlow.js";
import { sendCarousel } from "../services/interactive/carousel.js";
import { sendWebView } from "../services/interactive/webview.js";
import { sendPayment } from "../services/interactive/payment.js";
import { sendProduct } from "../services/interactive/product.js";
import { sendMultiProduct } from "../services/interactive/multiProduct.js";
import { sendCTACopy } from "../services/interactive/ctaCopy.js";
import CampaignService from "../services/CampaignService.js";
import { WhatsAppSession, Message } from "../models/index.js";

/**
 * Supported interactive message types
 */
const SUPPORTED_TYPES = [
  "quick_reply", // ✅ Fully Stable
  "cta_url", // ✅ Fully Stable
  "cta_call", // ✅ Fully Stable
  "cta_copy",
  "list", // ✅ Fully Stable
  "native_flow", // ✅ Fully Stable
  "carousel", // ⚠️ Semi Stable
  "webview", // ⚠️ Semi Stable
  "payment", // ⚠️ Semi Stable (India UPI)
  "product", // ❌ Use Cloud API
  "multi_product", // ❌ Use Cloud API
];

/**
 * Service handler mapping
 */
const typeHandlers = {
  quick_reply: sendQuickReply,
  cta_url: sendCTAUrl,
  cta_call: sendCTACall,

  cta_copy: sendCTACopy, // ✅ New
  list: sendListMessage,
  native_flow: sendNativeFlow,
  carousel: sendCarousel,
  webview: sendWebView,
  payment: sendPayment,
  product: sendProduct,
  multi_product: sendMultiProduct,
};

/**
 * Main interactive message handler
 *
 * Request body:
 * {
 *   "sessionId": "wa_123",
 *   "to": "918888888888",
 *   "type": "quick_reply",
 *   "data": { ... }
 * }
 */
export async function sendInteractiveMessage(req, res) {
  try {
    const { sessionId, to, type, data } = req.body;

    // Validate required fields
    if (!sessionId || !to || !type) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: sessionId, to, type",
      });
    }

    // Validate type
    if (!SUPPORTED_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid message type. Supported: ${SUPPORTED_TYPES.join(", ")}`,
      });
    }

    // Validate data
    if (!data || typeof data !== "object") {
      return res.status(400).json({
        success: false,
        error: "Data must be a valid object",
      });
    }

    // Get WhatsApp session socket
    const sock = getSessionSocket(sessionId);

    if (!sock) {
      return res.status(404).json({
        success: false,
        error: "WhatsApp session not found",
      });
    }

    // Get the handler for this type
    const handler = typeHandlers[type];

    if (!handler) {
      return res.status(500).json({
        success: false,
        error: "Handler not found for type: " + type,
      });
    }

    // Attempt to locate the WhatsApp session document so we can log the
    // outgoing message in the Message collection. Prefer the authenticated
    // user's session lookup when available.
    let sessionDoc = null;
    try {
      if (req.user && req.user._id) {
        sessionDoc = await CampaignService.findUserSession(
          req.user._id,
          sessionId,
        ).catch(() => null);
      }

      if (!sessionDoc) {
        sessionDoc = await WhatsAppSession.findOne({ sessionId }).catch(
          () => null,
        );
      }
    } catch (e) {
      sessionDoc = null;
    }

    // Determine source (api vs ui)
    const source = req.authMode === "api-key" ? "api" : "ui";

    // Create a Message log (if we have a session) before sending so we can
    // track status even if the send fails.
    let msgDoc = null;
    try {
      if (sessionDoc && sessionDoc._id) {
        const summary =
          (data && (data.body || data.text)) ||
          (typeof data === "object" ? JSON.stringify(data) : String(data));

        msgDoc = new Message({
          sessionId: sessionDoc._id,
          phoneNumber: to,
          contactName: "",
          message: `${type}: ${summary}`,
          messageType: "single",
          status: "pending",
          source,
        });

        await msgDoc.save();
        try {
          console.debug &&
            console.debug(
              `Interactive Message created: ${msgDoc._id} user:${req.user?._id || "unknown"} to:${to}`,
            );
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // If logging fails, continue to attempt sending the message.
      console.error("Failed to create interactive Message log:", e.message);
      msgDoc = null;
    }

    // Execute the handler
    try {
      await handler(sock, to, data);

      if (msgDoc) {
        msgDoc.status = "sent";
        msgDoc.sentAt = new Date();
        await msgDoc.save();
        try {
          console.debug &&
            console.debug(
              `Interactive Message sent: ${msgDoc._id} user:${req.user?._id || "unknown"}`,
            );
        } catch (e) {
          // ignore
        }
      }

      return res.json({
        success: true,
        message: "Interactive message sent successfully",
        type,
      });
    } catch (err) {
      // Update message log as failed when possible
      if (msgDoc) {
        msgDoc.status = "failed";
        msgDoc.error = err.message;
        await msgDoc.save().catch(() => null);
        try {
          console.error &&
            console.error(
              `Interactive Message failed: ${msgDoc._id} user:${req.user?._id || "unknown"} error:${err.message}`,
            );
        } catch (e) {
          // ignore
        }
      }

      throw err;
    }
  } catch (err) {
    console.error(`Error in sendInteractiveMessage (${req.body?.type}):`, err);

    return res.status(500).json({
      success: false,
      error: err.message || "Failed to send interactive message",
    });
  }
}

/**
 * Get supported message types info
 */
export async function getMessageTypes(req, res) {
  try {
    const typeInfo = {
      fullyStable: [
        "quick_reply",
        "cta_url",
        "cta_call",
        "list",
        "native_flow",
      ],
      semiStable: ["carousel", "webview", "payment"],
      notSupported: ["product", "multi_product"],
      supported: SUPPORTED_TYPES,
    };

    return res.json({
      success: true,
      data: typeInfo,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
