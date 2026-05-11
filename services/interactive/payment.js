/**
 * Payment Service
 * Status: ⚠️ Semi Stable (India UPI)
 *
 * Payment links via CTA URL button
 * Best for: UPI deep links, Razorpay, Stripe
 *
 * Usage:
 * {
 *   "type": "payment",
 *   "data": {
 *     "body": "Complete your payment",
 *     "buttons": [
 *       {
 *         "text": "Pay Now",
 *         "url": "https://rzp.io/i/xxxxx"
 *       }
 *     ]
 *   }
 * }
 */

import {
  generateWAMessageFromContent,
  WAProto as proto,
} from "@whiskeysockets/baileys";
import { validateButtons } from "./buttonMapper.js";
import { buildNativeFlowRelayNodes } from "./relayNodes.js";

export async function sendPayment(sock, to, data) {
  try {
    validateButtons(data.buttons);

    const jid = to.includes("@s.whatsapp.net") ? to : `${to}@s.whatsapp.net`;

    // Payment is just a CTA URL with payment link
    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            interactiveMessage: proto.Message.InteractiveMessage.create({
              body: {
                text: data.body || "Complete payment",
              },

              footer: {
                text: data.footer || "Secure payment link",
              },

              nativeFlowMessage:
                proto.Message.InteractiveMessage.NativeFlowMessage.create({
                  buttons: data.buttons.map((btn) => ({
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                      display_text: btn.text,
                      url: btn.url,
                    }),
                  })),
                }),
            }),
          },
        },
      },
      {},
    );

    await sock.relayMessage(jid, msg.message, {
      messageId: msg.key.id,
      additionalNodes: buildNativeFlowRelayNodes(),
    });
  } catch (error) {
    throw new Error(`Payment failed: ${error.message}`);
  }
}
