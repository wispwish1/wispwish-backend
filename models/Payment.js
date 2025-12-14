import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'usd',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
    },
    method: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },
    stripeSessionId: {
      type: String,
      index: true,
    },
    stripeCustomerId: String,
    buyerEmail: {
      type: String,
    },
    buyerName: {
      type: String,
    },
    metadata: mongoose.Schema.Types.Mixed,
    notes: String,
    completedAt: Date,
    refundedAt: Date,
    refundId: String,
  },
  { timestamps: true }
);

export default mongoose.model('Payment', paymentSchema);
