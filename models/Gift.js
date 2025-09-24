import mongoose from 'mongoose';

const giftSchema = new mongoose.Schema({
  giftType: {
    type: String,
    required: true,
    enum: ['poem', 'letter', 'shortStory', 'wishknot', 'voice', 'image', 'song', 'illustration', 'video', 'combo'], // Added 'combo' to the enum
  },
  senderName: {
    type: String,
    required: false,
    default: 'Someone special',
  },
  recipientName: {
    type: String,
    required: true,
  },
  tone: {
    type: String,
    required: true,
    enum: ['romantic', 'funny', 'heartfelt', 'inspirational'],
  },
  memories: {
    type: [String],
    default: [],
  },
  genre: {
    type: String,
    enum: ['pop', 'jazz', 'acoustic', 'rock', ''],
    default: '',
  },
  generatedContent: {
    type: mongoose.Schema.Types.Mixed, // Allow String or Object
    required: false,
  },
  audioContent: {
    type: String, // Base64 encoded audio data
    required: false,
  },
  videoContent: {
    type: String, // Video URL for video gifts
    required: false,
  },
  voiceStyleName: {
    type: String,
    default: '',
  },
  images: {
    type: [{ _id: String, url: String }],
    default: [],
  },
  selectedImageId: {
    type: String,
    required: false,
  },
  price: {
    type: Number,
    required: false,
    default: 8,
  },
  relationship: {
    type: String,
    required: false,
    default: 'friend',
  },
  occasion: {
    type: String,
    required: false,
    default: 'special occasion',
  },
  senderMessage: {
    type: String,
    required: false,
    default: '',
  },
  deliveryMethod: {
    type: String,
    enum: ['email', 'sms', 'download', ''],
    default: '',
  },
  deliveryEmail: {
    type: String,
    required: false,
    default: '',
  },
  buyerEmail: {
    type: String,
    required: false,
    default: '',
  },
  scheduledDate: {
    type: Date,
    required: false,
  },
  scheduledTimezone: {
    type: String,
    required: false,
    default: ''
  },
  scheduledOffsetMinutes: {
    type: Number,
    required: false,
    default: 0
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  deliveryStatus: {
    type: String,
    enum: ['pending', 'scheduled', 'delivered', 'failed'],
    default: 'pending'
  },
  deliveredAt: {
    type: Date,
    required: false,
  },
  // Add this field to store selected voice style (if any)
  voiceStyleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VoiceStyle',
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['pending', 'completed'],
    default: 'pending'
  },
});

export default mongoose.model('Gift', giftSchema);