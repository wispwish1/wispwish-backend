import mongoose from 'mongoose';

const giftUsageLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    gift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gift',
      required: true,
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
    },
    planType: {
      type: String,
      enum: ['monthly', 'weekly', 'pay_per_gift'],
      default: 'pay_per_gift',
    },
    isFree: {
      type: Boolean,
      default: false,
    },
    weekNumber: Number,
    chargedAmount: {
      type: Number,
      default: 0,
    },
    note: String,
    recordedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model('GiftUsageLog', giftUsageLogSchema);
