import {
  generateWAMessageFromContent,
  WAProto as proto,
} from "@whiskeysockets/baileys";

export async function sendCarousel(sock, to, data) {
  try {
    if (!Array.isArray(data.cards) || data.cards.length === 0) {
      throw new Error("Cards must be a non-empty array");
    }

    const jid = to.includes("@s.whatsapp.net") ? to : `${to}@s.whatsapp.net`;

    for (const card of data.cards) {
      const buttons = (card.buttons || []).map((btn) => {
        let parsed =
          typeof btn.buttonParamsJson === "string"
            ? JSON.parse(btn.buttonParamsJson)
            : btn.params || {};

        if (btn.name === "cta_url") {
          return {
            name: "cta_url",
            buttonParamsJson: JSON.stringify({
              display_text: parsed.display_text,
              url: parsed.url,
              merchant_url: parsed.url,
            }),
          };
        }

        return {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: parsed.display_text,
            id: parsed.id,
          }),
        };
      });

      const msg = generateWAMessageFromContent(
        jid,
        {
          viewOnceMessage: {
            message: {
              interactiveMessage: proto.Message.InteractiveMessage.create({
                // 🔥 FIXED HEADER (TEXT ONLY SAFE)
                header: proto.Message.InteractiveMessage.Header.create({
                  title: card.title || "",
                  subtitle: "",
                  hasMediaAttachment: false,
                }),

                body: proto.Message.InteractiveMessage.Body.create({
                  text: card.body || "",
                }),

                footer: proto.Message.InteractiveMessage.Footer.create({
                  text: card.footer || "",
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

      await new Promise((r) => setTimeout(r, 800));
    }

    return { success: true, type: "carousel" };
  } catch (error) {
    console.error("Carousel Error:", error);
    throw new Error(`Carousel failed: ${error.message}`);
  }
}
