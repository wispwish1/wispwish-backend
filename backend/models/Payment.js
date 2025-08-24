import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
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
    required: false,
  },
  completedAt: {
    type: Date,
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  refundedAt: {
    type: Date,
    required: false,
  },
  refundId: {
    type: String,
    required: false,
  },
  buyerEmail: {
    type: String,
    required: false, // Make optional
  },
  buyerName: {
    type: String, 
    required: false, // Make optional
  },
});

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
