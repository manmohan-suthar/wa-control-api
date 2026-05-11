/**
 * WebView Service
 * Status: ⚠️ Semi Stable
 *
 * Open external webview in WhatsApp
 *
 * Usage:
 * {
 *   "type": "webview",
 *   "data": {
 *     "body": "Click to open",
 *     "buttons": [
 *       {
 *         "text": "Open Webview",
 *         "url": "https://yourapp.com"
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

export async function sendWebView(sock, to, data) {
  try {
    validateButtons(data.buttons);

    const jid = to.includes("@s.whatsapp.net") ? to : `${to}@s.whatsapp.net`;

    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            interactiveMessage: proto.Message.InteractiveMessage.create({
              body: {
                text: data.body || "Open",
              },

              footer: {
                text: data.footer || "",
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
    throw new Error(`WebView failed: ${error.message}`);
  }
}
