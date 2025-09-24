// import mongoose from 'mongoose';

// const APIUsageSchema = new mongoose.Schema({
//     provider: { type: String, required: true }, // e.g., 'openai', 'stripe'
//     requests: { type: Number, default: 0 },
//     errors: { type: Number, default: 0 },
//     date: { type: Date, required: true },
//     updatedAt: { type: Date, default: Date.now }
// });

// export default mongoose.model('APIUsage', APIUsageSchema);


// models/APIUsage.js
import mongoose from 'mongoose';

const APIUsageSchema = new mongoose.Schema({
  provider: { type: String, required: true, enum: ['openai', 'elevenlabs', 'runwayml'] },
  requests: { type: Number, default: 0 },
  errors: { type: Number, default: 0 },
  characters: { type: Number, default: 0 }, // For APIs like ElevenLabs
  quotaLimit: { type: Number, required: true }, // Maximum allowed requests/characters
  unit: { type: String, enum: ['requests', 'characters'], required: true }, // Unit of measurement
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null }, // Associated order
  date: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('APIUsage', APIUsageSchema);