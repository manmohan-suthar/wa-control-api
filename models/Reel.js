import mongoose from "mongoose";

const ReelSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: "ReelCampaign" },
    index: { type: Number, required: true },
    path: { type: String, required: true },
    thumbnail: { type: String },
    title: { type: String },
    caption: { type: String },
    hashtags: { type: [String], default: [] },
    scheduledFor: { type: Date },
    status: {
      type: String,
      enum: ["pending", "processing", "uploading", "uploaded", "failed"],
      default: "pending",
    },
    instagramMediaId: { type: String },
    instagramPermalink: { type: String },
    error: { type: String },
  },
  { timestamps: true },
);

export default mongoose.model("Reel", ReelSchema);
