// models/Content.js
import mongoose from 'mongoose';

const contentSchema = new mongoose.Schema({
  section: {
    type: String,
    required: true,
    unique: true,
  },
  mailgunApiKey: {
    type: String,
    default: '',
  },
  mailgunDomain: {
    type: String,
    default: '',
  },
  fromEmail: {
    type: String,
    default: '',
  },
  fromName: {
    type: String,
    default: '',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const SiteContent = mongoose.model('SiteContent', contentSchema);

export default SiteContent;