// backend/models/AdminSettings.js

import mongoose from 'mongoose';

const adminSettingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
  },
  value: mongoose.Schema.Types.Mixed,
  description: String,
  category: {
    type: String,
    enum: ['email', 'payment', 'api', 'general', 'security'],
    default: 'general',
  },
  isEncrypted: {
    type: Boolean,
    default: false,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

const AdminSettings = mongoose.model('AdminSettings', adminSettingsSchema);
export default AdminSettings;
