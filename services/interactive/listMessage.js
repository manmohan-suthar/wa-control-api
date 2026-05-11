import { generateWAMessageFromContent } from "@whiskeysockets/baileys";

export async function sendListMessage(sock, to, data) {
  try {
    const jid = to.includes("@s.whatsapp.net") ? to : `${to}@s.whatsapp.net`;

    const sections = (data.sections || []).map((sec) => ({
      title: sec.title,
      rows: sec.rows.map((row) => ({
        title: row.title,
        description: row.description || "",
        rowId: row.rowId,
      })),
    }));

    const msg = generateWAMessageFromContent(
      jid,
      {
        listMessage: {
          title: data.title || "",
          description: data.body || "",
          buttonText: data.buttonText || "View",
          footerText: data.footer || "",
          sections,
        },
      },
      {},
    );

    await sock.relayMessage(jid, msg.message, {
      messageId: msg.key.id,
    });

    return { success: true, type: "list" };
  } catch (err) {
    console.error("List Error:", err);
    throw err;
  }
}
