import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    planId: String,
    planName: String,
    planDescription: String,
    frequency: {
      type: String,
      enum: ['weekly', 'monthly', 'custom'],
      default: 'monthly',
    },
    intervalCount: {
      type: Number,
      default: 1,
    },
    price: Number,
    currency: {
      type: String,
      default: 'usd',
    },
    status: {
      type: String,
      enum: [
        'pending',
        'active',
        'expired',
        'cancelled',
        'past_due',
        'unpaid',
        'incomplete',
        'incomplete_expired',
        'trialing',
      ],
      default: 'pending',
    },
    customerName: String,
    customerEmail: {
      type: String,
      lowercase: true,
      index: true,
    },
    subscriptionNotes: String,
    metadata: mongoose.Schema.Types.Mixed,
    stripeCustomerId: String,
    stripeSubscriptionId: {
      type: String,
      index: true,
    },
    checkoutSessionId: {
      type: String,
      unique: true,
      sparse: true,
    },
    startDate: Date,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    nextPaymentDate: Date,
    cancellationDate: Date,
    planActivatedAt: Date,
    planExpiresAt: Date,
    nextGiftDate: Date,
    lastGiftDate: Date,
    // Quota tracking fields
    giftCountThisPeriod: {
      type: Number,
      default: 0,
    },
    periodStartDate: Date,
    periodEndDate: Date,
  },
  { timestamps: true }
);

subscriptionSchema.index({ userId: 1, status: 1 });

export default mongoose.model('Subscription', subscriptionSchema);
