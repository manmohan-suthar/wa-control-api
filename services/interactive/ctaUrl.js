import {
  generateWAMessageFromContent,
  WAProto as proto,
} from "@whiskeysockets/baileys";
import { buildButtons, buildNativeFlowButtons } from "./buttonMapper.js";

export async function sendCTAUrl(sock, to, data) {
  try {
    const jid = to.includes("@s.whatsapp.net") ? to : `${to}@s.whatsapp.net`;

    // Build buttons using shared mapper. Accept both frontend formats and curl format.
    let buttons = [];
    if (data.buttons) {
      let buttonArray = Array.isArray(data.buttons) ? data.buttons : [data.buttons];
      
      if (buttonArray.length > 0) {
        const first = buttonArray[0];
        if (
          first &&
          typeof first === "object" &&
          (first.type || first.name === undefined)
        ) {
          buttons = buildButtons(buttonArray);
        } else {
          buttons = buildNativeFlowButtons(buttonArray);
        }
      }
    }

    const interactiveData = {
      body: {
        text: data.body || "Visit link",
      },
      nativeFlowMessage:
        proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons,
        }),
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
            interactiveMessage:
              proto.Message.InteractiveMessage.create(interactiveData),
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
