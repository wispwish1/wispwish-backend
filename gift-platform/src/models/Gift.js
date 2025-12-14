import mongoose from 'mongoose';

const giftSchema = new mongoose.Schema(
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
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    isFree: {
      type: Boolean,
      default: false,
    },
    chargedAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['generated', 'sent'],
      default: 'sent',
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Gift', giftSchema);
