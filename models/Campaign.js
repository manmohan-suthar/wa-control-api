import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  type: {
    type: String,
    enum: ["broadcast", "notification", "reminder", "otp", "marketing"],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  numberListId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "NumberList",
    required: true,
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "WhatsAppSession",
    required: true,
  },
  mode: {
    type: String,
    enum: ["instant", "scheduled", "interval", "delayed"],
    default: "instant",
  },
  startTime: {
    type: String, // HH:mm format
  },
  scheduledFor: {
    type: Date, // For scheduled campaigns
  },
  delaySeconds: {
    type: Number,
    default: 10,
    min: 0,
    max: 300,
  },
  minDelay: {
    type: Number,
    default: 10,
    min: 1,
    max: 300,
  },
  maxDelay: {
    type: Number,
    default: 30,
    min: 1,
    max: 300,
  },
  randomizeDelay: {
    type: Boolean,
    default: false,
  },
  autoRetry: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ["draft", "scheduled", "running", "paused", "completed", "failed"],
    default: "draft",
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  stats: {
    total: {
      type: Number,
      default: 0,
    },
    sent: {
      type: Number,
      default: 0,
    },
    delivered: {
      type: Number,
      default: 0,
    },
    failed: {
      type: Number,
      default: 0,
    },
    pending: {
      type: Number,
      default: 0,
    },
  },
  messageLog: [
    {
      phoneNumber: String,
      status: {
        type: String,
        enum: ["pending", "sent", "delivered", "failed"],
      },
      messageId: String,
      error: String,
      timestamp: {
        type: Date,
        default: Date.now,
      },
      retryCount: {
        type: Number,
        default: 0,
      },
    },
  ],
  mediaUrl: {
    type: String, // e.g. /uploads/filename.jpg (gallery) or full data URL (upload)
  },
  mediaType: {
    type: String,
    enum: ["image", "video", "audio", "pdf", "document"],
  },
  mediaName: {
    type: String,
  },
  currentIndex: {
    type: Number,
    default: 0,
  },
  pausedAt: Date,
  resumedAt: Date,
  completedAt: Date,
  failedAt: Date,

  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

campaignSchema.index({ userId: 1, status: 1 });
campaignSchema.index({ sessionId: 1 });
campaignSchema.index({ numberListId: 1 });
campaignSchema.index({ scheduledFor: 1 });

export default mongoose.model("Campaign", campaignSchema);
