import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: {type: String, required: true},
  role: { type: String, default: 'admin' }, // You can customize as needed
}, {
  timestamps: true // Optional: adds createdAt and updatedAt
});

export default mongoose.model('Admin', adminSchema);