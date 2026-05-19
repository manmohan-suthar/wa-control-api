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

    // Handle curl format: buttons can be a single object
    let buttons = [];
    if (data.buttons) {
      let buttonArray = Array.isArray(data.buttons) ? data.buttons : [data.buttons];
      buttons = buttonArray.map((btn) => ({
        name: "cta_call",
        buttonParamsJson: JSON.stringify({
          display_text: btn.text || btn.params?.display_text,
          phone_number: btn.phone || btn.params?.phone_number,
        }),
      }));
    }

    const interactiveData = {
      body: {
        text: data.body || "Call us",
      },
      nativeFlowMessage: {
        buttons,
      },
    };

    // Add optional header
    if (data.header) {
      interactiveData.header = {
        title: data.header,
        hasMediaAttachment: false,
      };
    }

    // Add optional footer
    if (data.footer) {
      interactiveData.footer = {
        text: data.footer,
      };
    }

    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            interactiveMessage: interactiveData,
          },
        },
      },
      {},
    );

    await sock.relayMessage(jid, msg.message, {
      messageId: msg.key.id,
    });

    return {
      success: true,
      type: "cta_call",
      messageId: msg?.key?.id,
    };
  } catch (error) {
    throw new Error(`CTA Call failed: ${error.message}`);
  }
}
