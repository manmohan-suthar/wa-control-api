import {
  generateWAMessageFromContent,
  WAProto as proto,
} from "@whiskeysockets/baileys";

import { getSessionSocket } from "../services/WhatsAppService.js";

export async function sendNativeMessage(req, res) {
  try {
    const { sessionId, to, title, body, footer, buttons } = req.body;

    if (!sessionId || !to) {
      return res.status(400).json({
        success: false,
        error: "sessionId and to required",
      });
    }

    const sock = getSessionSocket(sessionId);

    if (!sock) {
      return res.status(404).json({
        success: false,
        error: "WhatsApp session not found",
      });
    }

    const jid = to.includes("@s.whatsapp.net") ? to : `${to}@s.whatsapp.net`;

    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            interactiveMessage: proto.Message.InteractiveMessage.create({
              body: {
                text: body,
              },

              footer: {
                text: footer || "",
              },

              header: {
                title: title || "",
                hasMediaAttachment: false,
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

      additionalNodes: [
        {
          tag: "biz",
          attrs: {},
          content: [
            {
              tag: "interactive",
              attrs: {
                type: "native_flow",
                v: "1",
              },
              content: [
                {
                  tag: "native_flow",
                  attrs: {
                    name: "mixed",
                    v: "1",
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    return res.json({
      success: true,
      message: "Native interactive message sent",
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
