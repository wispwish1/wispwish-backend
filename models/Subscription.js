import mongoose from 'mongoose';

const SubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: String, required: true },
  stripeCustomerId: { type: String, required: true },
  stripeSubscriptionId: { type: String, required: true },
  status: { type: String, enum: ['active', 'cancelled', 'pending'], default: 'pending' },
  currentPeriodStart: { type: Date },
  currentPeriodEnd: { type: Date }
}, { timestamps: true });

export default mongoose.model('Subscription', SubscriptionSchema);