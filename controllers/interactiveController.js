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

    // Execute the handler
    await handler(sock, to, data);

    return res.json({
      success: true,
      message: "Interactive message sent successfully",
      type,
    });
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
