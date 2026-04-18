import mongoose from 'mongoose';

const numberListSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    numbers: [{ type: String, trim: true }],
    tags: [{ type: String, trim: true }],
    color: {
      type: String,
      default: 'bg-blue-500',
    },
  },
  { timestamps: true },
);

numberListSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('NumberList', numberListSchema);
