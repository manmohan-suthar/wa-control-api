import Campaign from "../models/Campaign.js";
import NumberList from "../models/NumberList.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import Message from "../models/Message.js";
import mongoose from "mongoose";
import WhatsAppService from "../services/WhatsAppService.js";
import SubscriptionService from "../services/SubscriptionService.js";
import { sendSubscriptionError } from "../utils/subscription.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, "../uploads");

// Create Campaign
export const createCampaign = async (req, res) => {
  try {
    const {
      name,
      description,
      type,
      message,
      numberListId,
      sessionId,
      mode,
      startTime,
      scheduledFor,
      delaySeconds,
      minDelay,
      maxDelay,
      randomizeDelay,
      autoRetry,
      mediaUrl,
      mediaType,
      mediaName,
    } = req.body;
    const userId = req.user.id;

    await SubscriptionService.assertResourceLimit(req.user, "campaigns", 1);

    // Validate required fields
    if (!name || !type || !message || !numberListId || !sessionId) {
      return res
        .status(400)
        .json({ success: false, error: "Missing required fields" });
    }

    // Verify session exists and belongs to user
    const session = await WhatsAppSession.findOne({ _id: sessionId, userId });
    if (!session) {
      return res
        .status(404)
        .json({ success: false, error: "WhatsApp session not found" });
    }

    if (session.status !== "connected") {
      return res
        .status(400)
        .json({ success: false, error: "WhatsApp session is not connected" });
    }

    // Validate number list exists and belongs to user
    const numberList = await NumberList.findOne({ _id: numberListId, userId });
    if (!numberList) {
      return res
        .status(404)
        .json({ success: false, error: "Number list not found" });
    }

    // Normalize mode: frontend sends "delayed" → store as "interval"
    const normalizedMode = mode === "delayed" ? "interval" : mode || "instant";

    // Determine delay based on mode
    let finalDelaySeconds = 0;
    if (normalizedMode === "interval" || normalizedMode === "scheduled") {
      finalDelaySeconds = Math.max(Number(delaySeconds) || 10, 0);
    }

    // Create campaign
    const campaign = new Campaign({
      userId: new mongoose.Types.ObjectId(userId),
      name,
      description,
      type,
      message,
      numberListId: new mongoose.Types.ObjectId(numberListId),
      sessionId: new mongoose.Types.ObjectId(sessionId),
      mode: normalizedMode,
      startTime,
      scheduledFor:
        normalizedMode === "scheduled" ? new Date(scheduledFor) : null,
      delaySeconds: finalDelaySeconds,
      minDelay: Number(minDelay) || 10,
      maxDelay: Number(maxDelay) || 30,
      randomizeDelay: !!randomizeDelay,
      autoRetry: !!autoRetry,
      status: normalizedMode === "scheduled" ? "scheduled" : "draft",
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      mediaName: mediaName || null,
      stats: {
        total: numberList.numbers.length,
        sent: 0,
        delivered: 0,
        failed: 0,
        pending: numberList.numbers.length,
      },
    });

    // Initialize message log
    campaign.messageLog = numberList.numbers.map((phone) => ({
      phoneNumber: phone,
      status: "pending",
      retryCount: 0,
    }));

    await campaign.save();

    res.status(201).json({
      success: true,
      data: campaign,
      message: "Campaign created successfully",
    });
  } catch (error) {
    console.error("Error creating campaign:", error);
    return sendSubscriptionError(res, error, "Failed to create campaign");
  }
};

// Get all campaigns for user
export const getCampaigns = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, type, search } = req.query;

    let query = { userId: new mongoose.Types.ObjectId(userId) };

    if (status && status !== "all") {
      query.status = status;
    }

    if (type && type !== "all") {
      query.type = type;
    }

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const campaigns = await Campaign.find(query)
      .populate("numberListId", "name")
      .populate("sessionId", "sessionId phone")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: campaigns });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get single campaign with details
export const getCampaignDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const campaign = await Campaign.findOne({
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(userId),
    })
      .populate("numberListId")
      .populate("sessionId");

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, error: "Campaign not found" });
    }

    res.json({ success: true, data: campaign });
  } catch (error) {
    console.error("Error fetching campaign details:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Start campaign (send messages)
export const startCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const campaign = await Campaign.findOne({
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(userId),
    })
      .populate("sessionId")
      .populate("numberListId");

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, error: "Campaign not found" });
    }

    if (campaign.status === "running") {
      return res
        .status(400)
        .json({ success: false, error: "Campaign is already running" });
    }

    // Update status to running
    campaign.status = "running";
    campaign.progress = 0;
    await campaign.save();

    // Start sending messages asynchronously
    sendCampaignMessages(campaign);

    res.json({
      success: true,
      data: campaign,
      message: "Campaign started - messages will be sent",
    });
  } catch (error) {
    console.error("Error starting campaign:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Pause campaign
export const pauseCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const campaign = await Campaign.findOne({
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, error: "Campaign not found" });
    }

    if (campaign.status !== "running") {
      return res.status(400).json({
        success: false,
        error: "Only running campaigns can be paused",
      });
    }

    campaign.status = "paused";
    campaign.pausedAt = new Date();
    await campaign.save();

    res.json({
      success: true,
      data: campaign,
      message: "Campaign paused",
    });
  } catch (error) {
    console.error("Error pausing campaign:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Resume campaign
export const resumeCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const campaign = await Campaign.findOne({
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(userId),
    })
      .populate("sessionId")
      .populate("numberListId");

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, error: "Campaign not found" });
    }

    if (campaign.status !== "paused") {
      return res.status(400).json({
        success: false,
        error: "Only paused campaigns can be resumed",
      });
    }

    campaign.status = "running";
    campaign.resumedAt = new Date();
    await campaign.save();

    // Resume sending messages
    sendCampaignMessages(campaign);

    res.json({
      success: true,
      data: campaign,
      message: "Campaign resumed",
    });
  } catch (error) {
    console.error("Error resuming campaign:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Retry failed messages
export const retryCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const campaign = await Campaign.findOne({
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(userId),
    })
      .populate("sessionId")
      .populate("numberListId");

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, error: "Campaign not found" });
    }

    if (campaign.status === "completed") {
      return res.status(400).json({
        success: false,
        error: "Completed campaigns cannot be retried",
      });
    }

    // Mark failed messages for retry
    campaign.messageLog.forEach((log) => {
      if (log.status === "failed") {
        log.status = "pending";
        log.retryCount = (log.retryCount || 0) + 1;
      }
    });

    // Update stats
    campaign.stats.pending = campaign.messageLog.filter(
      (l) => l.status === "pending",
    ).length;
    campaign.stats.failed = 0;
    campaign.status = "running";
    campaign.progress = 0;

    await campaign.save();

    // Resume sending
    sendCampaignMessages(campaign);

    res.json({
      success: true,
      data: campaign,
      message: "Retrying failed messages",
    });
  } catch (error) {
    console.error("Error retrying campaign:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Restart campaign (reset all logs and start fresh)
export const restartCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const campaign = await Campaign.findOne({
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(userId),
    }).populate("numberListId");

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, error: "Campaign not found" });
    }

    // Reset all message logs to pending
    campaign.messageLog = campaign.messageLog.map((log) => ({
      ...log.toObject(),
      status: "pending",
      retryCount: 0,
      error: undefined,
      timestamp: new Date(),
    }));

    const total = campaign.messageLog.length;
    campaign.stats = {
      total,
      sent: 0,
      delivered: 0,
      failed: 0,
      pending: total,
    };
    campaign.status = "draft";
    campaign.progress = 0;
    campaign.currentIndex = 0;
    campaign.pausedAt = undefined;
    campaign.resumedAt = undefined;
    campaign.completedAt = undefined;
    campaign.failedAt = undefined;

    await campaign.save();

    res.json({ success: true, data: campaign, message: "Campaign restarted" });
  } catch (error) {
    console.error("Error restarting campaign:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete campaign
export const deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const campaign = await Campaign.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, error: "Campaign not found" });
    }

    res.json({
      success: true,
      message: "Campaign deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get campaign report
export const getCampaignReport = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const campaign = await Campaign.findOne({
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, error: "Campaign not found" });
    }

    const report = {
      campaignId: campaign._id,
      name: campaign.name,
      type: campaign.type,
      status: campaign.status,
      progress: campaign.progress,
      stats: campaign.stats,
      deliveryRate:
        campaign.stats.total > 0
          ? ((campaign.stats.delivered / campaign.stats.total) * 100).toFixed(2)
          : 0,
      successRate:
        campaign.stats.sent > 0
          ? ((campaign.stats.delivered / campaign.stats.sent) * 100).toFixed(2)
          : 0,
      messageLog: campaign.messageLog,
      createdAt: campaign.createdAt,
      completedAt: campaign.completedAt,
    };

    res.json({ success: true, data: report });
  } catch (error) {
    console.error("Error fetching campaign report:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ──────────────────────────────────────────────────────────────────
// Internal function: Send campaign messages
// ──────────────────────────────────────────────────────────────────
async function sendCampaignMessages(campaign) {
  try {
    console.log(`\n📢 Starting Campaign: ${campaign.name}`);
    console.log(`📱 Total Recipients: ${campaign.messageLog.length}`);
    console.log(`⏱️  Delay Between Messages: ${campaign.delaySeconds}s\n`);

    // Get the session to get the actual sessionId string (e.g., "wa_xxx")
    const session = await WhatsAppSession.findById(campaign.sessionId);
    if (!session) {
      throw new Error("WhatsApp session not found");
    }

    const sessionIdString = session.sessionId; // This is the correct format for WhatsAppService

    const pendingMessages = campaign.messageLog.filter(
      (log) => log.status === "pending",
    );
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < pendingMessages.length; i++) {
      const messageLog = pendingMessages[i];
      let freshCampaign;

      try {
        // Get fresh campaign data
        freshCampaign = await Campaign.findById(campaign._id);
        if (freshCampaign.status === "paused") {
          break;
        }

        // Replace placeholders in message
        let messageText = campaign.message;
        messageText = messageText.replace("{name}", "User");
        messageText = messageText.replace(
          "{date}",
          new Date().toLocaleDateString(),
        );
        messageText = messageText.replace(
          "{time}",
          new Date().toLocaleTimeString(),
        );
        messageText = messageText.replace("{phone}", messageLog.phoneNumber);

        console.log(
          `[${i + 1}/${pendingMessages.length}] 📤 Sending to +${messageLog.phoneNumber}...`,
        );

        // Resolve media file path if campaign has media
        let mediaPath = null;
        let mediaMime = null;
        if (campaign.mediaUrl) {
          if (campaign.mediaUrl.startsWith("/uploads/")) {
            const filename = campaign.mediaUrl.replace("/uploads/", "");
            const diskPath = path.join(UPLOADS_DIR, filename);
            if (fs.existsSync(diskPath)) {
              mediaPath = diskPath;
              const mimeMap = {
                image: "image/jpeg",
                video: "video/mp4",
                audio: "audio/mpeg",
                pdf: "application/pdf",
                document: "application/octet-stream",
              };
              mediaMime = mimeMap[campaign.mediaType] || "image/jpeg";
            }
          }
        }

        await SubscriptionService.assertMessageQuota(
          { _id: campaign.userId },
          1,
        );

        // ✅ CORRECT: Use the actual sessionId string from the session (e.g., "wa_xxx")
        const result = await WhatsAppService.sendMessage(
          sessionIdString,
          messageLog.phoneNumber,
          messageText,
          mediaPath,
          mediaMime,
        );

        await SubscriptionService.consumeMessageQuota(campaign.userId, 1);

        // Update message log to sent
        const logEntry = freshCampaign.messageLog.find(
          (l) => l.phoneNumber === messageLog.phoneNumber,
        );
        if (logEntry) {
          logEntry.status = "sent";
          logEntry.timestamp = new Date();
        }

        freshCampaign.stats.sent += 1;
        freshCampaign.stats.pending -= 1;
        successCount++;
        console.log(`✅ Message sent to +${messageLog.phoneNumber}`);
      } catch (error) {
        console.error(
          `❌ Failed to send to +${messageLog.phoneNumber}: ${error.message}`,
        );

        if (freshCampaign) {
          // Update message log to failed
          const logEntry = freshCampaign.messageLog.find(
            (l) => l.phoneNumber === messageLog.phoneNumber,
          );
          if (logEntry) {
            logEntry.status = "failed";
            logEntry.error = error.message;
          }

          freshCampaign.stats.failed += 1;
          freshCampaign.stats.pending -= 1;
          failureCount++;

          if (
            error?.code === "LIMIT_EXCEEDED" ||
            error?.name === "LimitError"
          ) {
            freshCampaign.status = "failed";
            freshCampaign.failedAt = new Date();
            await freshCampaign.save();
            console.log(
              "⛔ Campaign stopped due to subscription message limits",
            );
            break;
          }
        }
      }

      if (freshCampaign) {
        // Update progress
        const sent = freshCampaign.messageLog.filter(
          (l) => l.status !== "pending",
        ).length;
        freshCampaign.progress = Math.round(
          (sent / campaign.messageLog.length) * 100,
        );

        await freshCampaign.save();

        // Calculate delay between messages
        let delayMs = 0;
        if (campaign.mode !== "instant") {
          if (campaign.randomizeDelay) {
            const min = Math.max(campaign.minDelay || 10, 1);
            const max = Math.max(campaign.maxDelay || 30, min);
            const secs = Math.floor(Math.random() * (max - min + 1)) + min;
            delayMs = secs * 1000;
          } else {
            delayMs = Math.max(campaign.delaySeconds || 10, 1) * 1000;
          }
        }

        // Apply delay only between messages (not after last one)
        if (delayMs > 0 && i < pendingMessages.length - 1) {
          const delaySec = (delayMs / 1000).toFixed(1);
          console.log(`⏳ Waiting ${delaySec}s before next message...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    // Auto-retry failed messages once if enabled
    if (campaign.autoRetry && failureCount > 0) {
      console.log(`\n🔄 Auto-retrying ${failureCount} failed messages…`);
      const retryList = await Campaign.findById(campaign._id);
      if (retryList && retryList.status === "running") {
        const failedLogs = retryList.messageLog.filter(
          (l) => l.status === "failed",
        );
        for (const log of failedLogs) {
          try {
            const session = await WhatsAppSession.findById(campaign.sessionId);
            await SubscriptionService.assertMessageQuota(
              { _id: campaign.userId },
              1,
            );
            await WhatsAppService.sendMessage(
              session.sessionId,
              log.phoneNumber,
              campaign.message,
            );
            await SubscriptionService.consumeMessageQuota(campaign.userId, 1);
            log.status = "sent";
            log.retryCount = (log.retryCount || 0) + 1;
            retryList.stats.sent += 1;
            retryList.stats.failed -= 1;
            successCount++;
            failureCount--;
            console.log(`✅ Retry OK: +${log.phoneNumber}`);
          } catch (err) {
            console.log(
              `❌ Retry failed: +${log.phoneNumber} — ${err.message}`,
            );
          }
          await new Promise((r) => setTimeout(r, 5000)); // 5s between retries
        }
        await retryList.save();
      }
    }

    // Mark campaign as completed
    const finalCampaign = await Campaign.findById(campaign._id);
    if (finalCampaign.status === "running") {
      finalCampaign.status = "completed";
      finalCampaign.progress = 100;
      finalCampaign.completedAt = new Date();
      await finalCampaign.save();

      console.log(`\n✅ Campaign "${finalCampaign.name}" Completed!`);
      console.log(`   ✓ Sent: ${successCount}`);
      console.log(`   ✗ Failed: ${failureCount}\n`);
    }
  } catch (error) {
    console.error("❌ Critical Error in sendCampaignMessages:", error);

    try {
      const finalCampaign = await Campaign.findById(campaign._id);
      if (finalCampaign) {
        finalCampaign.status = "failed";
        finalCampaign.failedAt = new Date();
        await finalCampaign.save();
      }
    } catch (updateError) {
      console.error("Error updating campaign status:", updateError);
    }
  }
}

// Called by the scheduler in server.js
export const startCampaignById = async (campaignId) => {
  const campaign = await Campaign.findById(campaignId)
    .populate("sessionId")
    .populate("numberListId");
  if (!campaign || campaign.status !== "scheduled") return;
  campaign.status = "running";
  campaign.progress = 0;
  await campaign.save();
  console.log(
    `⏰ [SCHEDULER] Auto-starting scheduled campaign: ${campaign.name}`,
  );
  sendCampaignMessages(campaign);
};

export default {
  createCampaign,
  getCampaigns,
  getCampaignDetails,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  retryCampaign,
  restartCampaign,
  deleteCampaign,
  getCampaignReport,
};
