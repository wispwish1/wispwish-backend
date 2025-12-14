import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
    },
    gift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gift',
    },
    planType: {
      type: String,
      enum: ['monthly', 'weekly', 'pay_per_gift'],
      default: 'pay_per_gift',
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'usd',
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    expiryDate: Date,
    giftUsageCount: {
      type: Number,
      default: 0,
    },
    provider: {
      type: String,
      default: 'stripe-test',
    },
    providerPaymentId: String,
    status: {
      type: String,
      enum: ['pending', 'succeeded', 'failed'],
      default: 'succeeded',
    },
    notes: String,
  },
  { timestamps: true }
);

export default mongoose.model('Payment', paymentSchema);
