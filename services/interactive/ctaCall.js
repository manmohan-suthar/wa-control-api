/**
 * CTA Call Service
 * Status: ✅ Fully Stable
 *
 * Call-To-Action Call Button
 *
 * Usage:
 * {
 *   "type": "cta_call",
 *   "data": {
 *     "body": "Need support?",
 *     "buttons": [
 *       {
 *         "text": "Call Now",
 *         "phone": "+919999999999"
 *       }
 *     ]
 *   }
 * }
 */

import { generateWAMessageFromContent } from "@whiskeysockets/baileys";

export async function sendCTACall(sock, to, data) {
  try {
    const jid = to.includes("@s.whatsapp.net") ? to : `${to}@s.whatsapp.net`;

    const buttons = (data.buttons || []).map((btn) => ({
      name: "cta_call",
      buttonParamsJson: JSON.stringify({
        display_text: btn.text,
        phone_number: btn.phone,
      }),
    }));

    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            interactiveMessage: {
              body: {
                text: data.body || "Call us",
              },

              footer: {
                text: data.footer || "",
              },

              header: {
                title: data.title || "Call",
                hasMediaAttachment: false,
              },

              nativeFlowMessage: {
                buttons,
              },
            },
          },
        },
      },
      {},
    );

    await sock.relayMessage(jid, msg.message, {
      messageId: msg.key.id,
    });
  } catch (error) {
    throw new Error(`CTA Call failed: ${error.message}`);
  }
}
