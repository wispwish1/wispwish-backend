import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  giftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gift' },
  type: { type: String, required: true, enum: ['poem', 'voice', 'illustration', 'video', 'image'] },
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
  // Add this field:
  status: { type: String, default: 'pending', enum: ['pending', 'processing', 'completed', 'cancelled'] },
});

export default mongoose.model('Order', OrderSchema);