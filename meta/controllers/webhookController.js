import MetaMessage from "../models/MetaMessage.js";
import MetaSystemSettings from "../models/MetaSystemSettings.js";
import WABAccount from "../models/WABAccount.js";

// GET /api/meta/webhook  (Meta verification)
export async function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const settings = await MetaSystemSettings.getSingleton();
  const verifyToken = settings.webhookVerifyToken || process.env.META_WEBHOOK_VERIFY_TOKEN || "whatsapp_saas_verify";

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[Webhook] Verified");
    return res.status(200).send(challenge);
  }
  console.warn("[Webhook] Verification failed. token:", token);
  res.status(403).send("Forbidden");
}

// POST /api/meta/webhook  (Meta events)
export async function receiveWebhook(req, res) {
  try {
    res.sendStatus(200); // respond immediately

    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;

        const value = change.value;

        // Status updates
        for (const status of value.statuses || []) {
          await handleStatusUpdate(status);
        }

        // Incoming messages
        for (const message of value.messages || []) {
          await handleIncomingMessage(message, value.metadata);
        }
      }
    }
  } catch (err) {
    console.error("[Webhook] Processing error:", err.message);
  }
}

async function handleStatusUpdate(status) {
  const { id: messageId, status: newStatus, timestamp } = status;

  const update = { status: newStatus };
  if (newStatus === "delivered") update.deliveredAt = new Date(Number(timestamp) * 1000);
  if (newStatus === "read") update.readAt = new Date(Number(timestamp) * 1000);

  await MetaMessage.findOneAndUpdate({ messageId }, update);
}

async function handleIncomingMessage(message, metadata) {
  const waba = await WABAccount.findOne({ wabaId: metadata.phone_number_id }).lean();

  await MetaMessage.create({
    userId: waba?.userId || null,
    wabaId: waba?._id || null,
    phoneNumberId: metadata.phone_number_id,
    from: message.from,
    to: metadata.display_phone_number || "",
    messageId: message.id,
    type: "incoming",
    body: message.text?.body || message.type || "",
    status: "delivered",
    deliveredAt: new Date(Number(message.timestamp) * 1000),
  });
}
