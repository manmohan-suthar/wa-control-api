import {
  generateWAMessageFromContent,
  WAProto as proto,
} from "@whiskeysockets/baileys";
import { buildButtons, buildNativeFlowButtons } from "./buttonMapper.js";

export async function sendCTAUrl(sock, to, data) {
  try {
    const jid = to.includes("@s.whatsapp.net") ? to : `${to}@s.whatsapp.net`;

    // Build buttons using shared mapper. Accept both frontend formats.
    let buttons = [];
    if (Array.isArray(data.buttons) && data.buttons.length > 0) {
      const first = data.buttons[0];
      if (
        first &&
        typeof first === "object" &&
        (first.type || first.name === undefined)
      ) {
        buttons = buildButtons(data.buttons);
      } else {
        buttons = buildNativeFlowButtons(data.buttons);
      }
    }

    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            interactiveMessage: proto.Message.InteractiveMessage.create({
              body: {
                text: data.body || "Visit link",
              },
              footer: {
                text: data.footer || "",
              },
              nativeFlowMessage:
                proto.Message.InteractiveMessage.NativeFlowMessage.create({
                  buttons,
                }),
            }),
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
      type: "cta_url",
      messageId: msg?.key?.id,
    };
  } catch (error) {
    console.error("CTA URL ERROR:", error);
    throw new Error(`CTA URL failed: ${error.message}`);
  }
}
