import path from "path";
import fs from "fs";
import Reel from "../models/Reel.js";
import ReelCampaign from "../models/ReelCampaign.js";
import { uploadReel } from "../services/reels/instagramUploadService.js";
import { generateCaptionForPart } from "../services/reels/aiCaptionService.js";

// Worker disabled - Redis not available
// To enable: install Redis and uncomment below
console.log(
  "ℹ️  Reel worker disabled (requires Redis). Install Redis to enable job scheduling.",
);

/*
let worker = null;

try {
  const { Worker } = await import("bullmq");
  const IORedis = (await import("ioredis")).default;

  const connection = new IORedis(
    process.env.REDIS_URL || "redis://127.0.0.1:6379",
    {
      enableReadyCheck: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    },
  );

  connection.on("error", () => {
    // Suppress error logging
  });

  worker = new Worker(
    "reelQueue",
    async (job) => {
      const { type, reelId } = job.data;
      if (type === "uploadReel") {
        const reel = await Reel.findById(reelId).populate("campaign");
        if (!reel) throw new Error("Reel not found");

        await Reel.findByIdAndUpdate(reelId, { status: "uploading" });
        try {
          const campaign = reel.campaign;
          // assemble caption using stored caption or generate
          let caption = reel.caption;
          if (!caption) {
            const ai = await generateCaptionForPart({
              campaignTitle: campaign.campaignTitle,
              youtubeTitle: campaign.youtubeTitle,
              index: reel.index,
              tone: campaign.captionTone || "Viral",
              hashtagCount: campaign.hashtagCount || 5,
            });
            caption = `${ai.hook || ""}\n\n${ai.caption || ""}\n\n${(ai.hashtags || []).join(" ")}`;
            reel.caption = caption;
            await reel.save();
          }

          // access token & ig id should be retrieved from user's connected account (simplified)
          const accessToken = process.env.INSTAGRAM_TEST_TOKEN;
          const igUserId = process.env.INSTAGRAM_TEST_IGID;

          const res = await uploadReel({
            filePath: reel.path,
            caption,
            accessToken,
            igUserId,
          });
          reel.instagramMediaId = res.mediaId;
          reel.instagramPermalink = res.permalink;
          reel.status = "uploaded";
          await reel.save();

          await ReelCampaign.findByIdAndUpdate(campaign._id, {
            $inc: { uploadedReels: 1 },
          });

          // optionally delete file
          if (campaign.autoDelete) {
            try {
              fs.unlinkSync(reel.path);
            } catch (e) {}
          }
        } catch (err) {
          await Reel.findByIdAndUpdate(reelId, {
            status: "failed",
            error: err.message,
          });
          await ReelCampaign.findByIdAndUpdate(reel.campaign, {
            $inc: { failedReels: 1 },
          });
          throw err;
        }
      }
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    console.error("Job failed", job.id, err.message);
  });

  console.log("✅ Reel worker started");
} catch (err) {
  // Worker requires Redis - silently skip
}
*/
