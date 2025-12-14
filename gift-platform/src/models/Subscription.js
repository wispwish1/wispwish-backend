import mongoose from 'mongoose';

const weeklyUsageSchema = new mongoose.Schema(
  {
    weekNumber: Number,
    used: {
      type: Boolean,
      default: false,
    },
    usedAt: Date,
  },
  { _id: false }
);

const subscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    planType: {
      type: String,
      enum: ['monthly', 'weekly'],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      default: 'active',
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: true,
    },
    freeGiftsUsed: {
      type: Number,
      default: 0,
    },
    weeklyUsage: {
      type: [weeklyUsageSchema],
      default: [],
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
    },
    giftUsageCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Subscription', subscriptionSchema);
