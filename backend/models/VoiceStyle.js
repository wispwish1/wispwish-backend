import mongoose from 'mongoose';

const voiceStyleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  provider: { type: String, enum: ['elevenlabs'], default: 'elevenlabs' },
  voiceId: { type: String, required: true },
  gender: { type: String, enum: ['male', 'female', 'other', 'unknown'], default: 'unknown' },
  accent: { type: String, default: '' },
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  previewUrl: { type: String, default: '' },
}, {
  timestamps: true,
});

// Ensure only one default at a time by helper method; enforcement will be in routes
const VoiceStyle = mongoose.models.VoiceStyle || mongoose.model('VoiceStyle', voiceStyleSchema);

export default VoiceStyle;


