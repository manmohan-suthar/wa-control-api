import mongoose from "mongoose";

const ReelCampaignSchema = new mongoose.Schema(
  {
    youtubeUrl: { type: String, required: true },
    youtubeTitle: { type: String },
    campaignTitle: { type: String, required: true },
    reelLengthSec: { type: Number, default: 60 },
    uploadGapMinutes: { type: Number, default: 60 },
    captionTone: { type: String },
    hashtagCount: { type: Number, default: 5 },
    autoDelete: { type: Boolean, default: true },
    autoStart: { type: Boolean, default: false },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: ["pending", "processing", "running", "completed", "failed"],
      default: "pending",
    },
    totalReels: { type: Number, default: 0 },
    uploadedReels: { type: Number, default: 0 },
    failedReels: { type: Number, default: 0 },
    thumbnail: { type: String },
    tempDownloadPath: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default mongoose.model("ReelCampaign", ReelCampaignSchema);
