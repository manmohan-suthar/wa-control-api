import {
  generateWAMessageFromContent,
  WAProto as proto,
} from "@whiskeysockets/baileys";

export async function sendNativeFlow(sock, to, data) {
  try {
    const jid = to.includes("@s.whatsapp.net") ? to : `${to}@s.whatsapp.net`;

    const buttons = (data.buttons || []).map((btn) => {
      let parsed;

      try {
        parsed =
          typeof btn.buttonParamsJson === "string"
            ? JSON.parse(btn.buttonParamsJson)
            : btn.params || {};
      } catch (e) {
        throw new Error("Invalid buttonParamsJson format");
      }

      return {
        name: btn.name || "single_select",
        buttonParamsJson: JSON.stringify(parsed),
      };
    });

    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            interactiveMessage: proto.Message.InteractiveMessage.create({
              body: proto.Message.InteractiveMessage.Body.create({
                text: data.body || "",
              }),

              footer: proto.Message.InteractiveMessage.Footer.create({
                text: data.footer || "",
              }),

              header: proto.Message.InteractiveMessage.Header.create({
                title: data.title || "",
                hasMediaAttachment: false,
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
      type: "native_flow",
      messageId: msg.key.id,
    };
  } catch (err) {
    console.error("Native Flow Error:", err);
    throw err;
  }
}
