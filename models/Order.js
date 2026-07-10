import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  giftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gift' },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
  type: { 
    type: String, 
    required: true, 
    enum: ['voice-poem', 'poem', 'voice', 'illustration', 'video', 'image', 'song', 'wishknot', 'letter', 'shortStory', 'combo', 'subscription'] 
  },
  planName: { type: String },
  planFrequency: { type: String },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  paymentStatus: { type: String, default: 'pending', enum: ['pending', 'processing', 'completed', 'failed'] },
  price: { type: Number },
  createdAt: { type: Date, default: Date.now },
  updatedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  status: { type: String, default: 'pending', enum: ['pending', 'processing', 'completed', 'cancelled'] },
});

export default mongoose.model('Order', OrderSchema);
