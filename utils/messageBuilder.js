import { generateWAMessageFromContent, proto } from "@whiskeysockets/baileys";

export function buildCTA(jid, text, url) {
  return generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: proto.Message.InteractiveMessage.fromObject({
            body: { text },
            footer: { text: "Bot System" },
            header: { title: "CTA Button", hasMediaAttachment: false },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "cta_url",
                  buttonParamsJson: JSON.stringify({
                    display_text: "Open Link",
                    url,
                  }),
                },
              ],
            },
          }),
        },
      },
    },
    {},
  );
}
