import {
  generateWAMessageFromContent,
  WAProto as proto,
} from "@whiskeysockets/baileys";

const normalizeButtonParams = (btn = {}) => {
  // Handle curl format: { text: "...", code: "..." }
  if (btn.text && btn.code !== undefined) {
    return {
      display_text: btn.text,
      copy_code: btn.code,
    };
  }

  if (btn.params && typeof btn.params === "object") {
    return btn.params;
  }

  if (typeof btn.buttonParamsJson === "string") {
    try {
      return JSON.parse(btn.buttonParamsJson);
    } catch {
      return {};
    }
  }

  return {
    display_text: btn.text || "Copy OTP",
    copy_code: btn.code || "",
  };
};

export async function sendCTACopy(sock, to, data) {
  try {
    const jid = to.includes("@s.whatsapp.net") ? to : `${to}@s.whatsapp.net`;

    const buttons = (data.buttons || []).map((btn) => ({
      name: "cta_copy",
      buttonParamsJson: JSON.stringify(normalizeButtonParams(btn)),
    }));

    const interactiveData = {
      body: {
        text: data.body || "Your OTP",
      },
      nativeFlowMessage:
        proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons,
        }),
    };

    // Add optional header if provided
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
      type: "cta_copy",
      messageId: msg?.key?.id,
    };
  } catch (err) {
    throw new Error(`CTA Copy failed: ${err.message}`);
  }
}
