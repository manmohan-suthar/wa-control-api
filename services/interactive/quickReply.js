import {
  generateWAMessageFromContent,
  WAProto as proto,
  prepareWAMessageMedia,
} from "@whiskeysockets/baileys";

export async function sendQuickReply(sock, to, data) {
  try {
    const jid = to.includes("@s.whatsapp.net") ? to : `${to}@s.whatsapp.net`;

    const buttons = (data.buttons || []).map((btn) => {
      const parsed =
        typeof btn.buttonParamsJson === "string"
          ? JSON.parse(btn.buttonParamsJson)
          : btn.params || {};

      return {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify(parsed),
      };
    });

    // 🔥 FIX: Proper media preparation (IMPORTANT)
    let header;

    if (data.image) {
      const media = await prepareWAMessageMedia(
        { image: { url: data.image } },
        { upload: sock.waUploadToServer },
      );

      header = proto.Message.InteractiveMessage.Header.create({
        hasMediaAttachment: true,
        imageMessage: media.imageMessage,
        title: data.title || "",
      });
    } else {
      header = proto.Message.InteractiveMessage.Header.create({
        hasMediaAttachment: false,
        title: data.title || "",
      });
    }

    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            interactiveMessage: proto.Message.InteractiveMessage.create({
              header,

              body: proto.Message.InteractiveMessage.Body.create({
                text: data.body || "",
              }),

              footer: proto.Message.InteractiveMessage.Footer.create({
                text: data.footer || "",
              }),

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
      type: "quick_reply",
    };
  } catch (error) {
    console.error("Quick Reply Error:", error);
    throw error;
  }
}
