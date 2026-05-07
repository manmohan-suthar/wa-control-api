import ReelCampaign from "../models/ReelCampaign.js";
import Reel from "../models/Reel.js";
import fs from "fs";
import path from "path";
import { downloadYouTube } from "../services/reels/youtubeDownloadService.js";
import { splitVideoToClips } from "../services/reels/ffmpegSplitService.js";
import { generateCaptionForPart } from "../services/reels/aiCaptionService.js";
import { addReelJob } from "../services/reels/reelQueue.js";

let io = null;
export function setSocketIO(ioInstance) {
  io = ioInstance;
}

function emitProgress(userId, campaignId, event) {
  if (io) {
    io.to(`user:${userId}`).emit("reel:progress", { campaignId, ...event });
    console.log(`[📡 EMIT] ${event.stage}: ${JSON.stringify(event)}`);
  }
}

export async function createCampaign(req, res) {
  try {
    const body = req.body;
    const owner = req.user?._id;
    const reelLengthSec = parseInt(body.reelLengthSec, 10) || 60;

    console.log(`[🎬 CAMPAIGN] Creating campaign: ${body.campaignTitle}`);

    const campaign = await ReelCampaign.create({
      youtubeUrl: body.youtubeUrl,
      youtubeTitle: body.youtubeTitle,
      campaignTitle: body.campaignTitle,
      reelLengthSec,
      uploadGapMinutes: parseInt(body.uploadGapMinutes, 10) || 60,
      captionTone: body.captionTone,
      hashtagCount: parseInt(body.hashtagCount, 10) || 5,
      autoDelete: !!body.autoDelete,
      autoStart: !!body.autoStart,
      owner,
      status: "processing",
    });

    emitProgress(owner, campaign._id, { stage: "created", message: "Campaign created" });

    // STEP 1: Download
    console.log(`[🎬 CAMPAIGN] STEP 1: Downloading YouTube video...`);
    emitProgress(owner, campaign._id, { stage: "downloading", message: "Downloading YouTube video..." });
    
    const downloaded = await downloadYouTube(
      campaign.youtubeUrl,
      campaign.campaignTitle || "youtube",
      (prog) => emitProgress(owner, campaign._id, { stage: "downloading", ...prog }),
    );
    campaign.tempDownloadPath = downloaded;
    await campaign.save();

    emitProgress(owner, campaign._id, { stage: "downloaded", message: "Video downloaded successfully" });

    // STEP 2: Split
    console.log(`[🎬 CAMPAIGN] STEP 2: Splitting video into clips...`);
    emitProgress(owner, campaign._id, { stage: "splitting", message: "Splitting video into clips..." });
    
    const clips = await splitVideoToClips(
      downloaded,
      campaign.reelLengthSec,
      (prog) => emitProgress(owner, campaign._id, { stage: "splitting", ...prog }),
    );
    campaign.totalReels = clips.length;
    await campaign.save();

    emitProgress(owner, campaign._id, { stage: "split", message: `Video split into ${clips.length} clips` });

    // STEP 3: create Reel documents and schedule uploads
    console.log(`[🎬 CAMPAIGN] STEP 3: Generating AI captions for ${clips.length} clips...`);
    emitProgress(owner, campaign._id, { stage: "captioning", message: "Generating AI captions..." });
    
    const reels = [];
    for (let i = 0; i < clips.length; i++) {
      const clipPath = clips[i];
      
      console.log(`[🎬 CAMPAIGN] Generating caption ${i + 1}/${clips.length}...`);
      emitProgress(owner, campaign._id, { stage: "captioning", current: i + 1, total: clips.length });
      
      const ai = await generateCaptionForPart({
        campaignTitle: campaign.campaignTitle,
        youtubeTitle: campaign.youtubeTitle || "",
        index: i + 1,
        tone: campaign.captionTone || "Viral",
        hashtagCount: campaign.hashtagCount || 5,
      });

      const scheduledFor = new Date(
        Date.now() + i * campaign.uploadGapMinutes * 60_000,
      );

      const reelDoc = await Reel.create({
        campaign: campaign._id,
        index: i + 1,
        path: clipPath,
        title: ai.title || `Part ${i + 1}`,
        caption: `${ai.hook || ""}\n\n${ai.caption || ""}\n\n${(ai.hashtags || []).join(" ")}`,
        hashtags: ai.hashtags || [],
        scheduledFor,
        status: scheduledFor <= new Date() ? "pending" : "pending",
      });

      reels.push(reelDoc);

      // schedule job in BullMQ with delay equal to scheduledFor - now
      const delay = Math.max(0, new Date(scheduledFor) - new Date());
      await addReelJob(
        "uploadReel",
        { type: "uploadReel", reelId: reelDoc._id },
        { delay },
      );
    }

    campaign.status = "running";
    await campaign.save();

    console.log(`[✅ CAMPAIGN] Campaign creation complete! ${clips.length} reels created.`);
    emitProgress(owner, campaign._id, { stage: "complete", message: "Campaign ready!", reelCount: clips.length });

    res.json({ success: true, campaign, reels });
  } catch (err) {
    console.error(`[❌ CAMPAIGN] Error: ${err.message}`, err);
    emitProgress(req.user?._id, null, { stage: "error", message: err.message });
    res.status(500).json({ error: err.message });
  }
}
 
export async function listCampaigns(req, res) {
  const owner = req.user?._id;
  const items = await ReelCampaign.find({ owner }).sort({ createdAt: -1 });
  res.json(items);
}

export async function getCampaign(req, res) {
  const id = req.params.id;
  const campaign = await ReelCampaign.findById(id);
  if (!campaign) return res.status(404).json({ error: "Not found" });
  const reels = await Reel.find({ campaign: campaign._id }).sort({ index: 1 });
  res.json({ campaign, reels });
}

export async function retryReel(req, res) {
  const reelId = req.params.id;
  const reel = await Reel.findById(reelId);
  if (!reel) return res.status(404).json({ error: "Not found" });
  reel.status = "pending";
  await reel.save();
  await addReelJob("uploadReel", { type: "uploadReel", reelId: reel._id }, {});
  res.json({ success: true });
}

export async function deleteReel(req, res) {
  const reelId = req.params.id;
  const reel = await Reel.findById(reelId);
  if (!reel) return res.status(404).json({ error: "Not found" });
  try {
    fs.unlinkSync(reel.path);
  } catch (e) {}
  await Reel.deleteOne({ _id: reelId });
  res.json({ success: true });
}
