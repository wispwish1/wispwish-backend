import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

const giftTypeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  description: { type: String },
});

// ✅ Safe model initialization
const GiftType = mongoose.models.GiftType || mongoose.model('GiftType', giftTypeSchema);

// Get All Gift Types
router.get('/', async (req, res) => {
  try {
    const giftTypes = await GiftType.find();
    res.status(200).json(giftTypes);
  } catch (error) {
    console.error('Error fetching gift types:', error.message);
    res.status(500).json({ message: 'Error fetching gift types', error: error.message });
  }
});

// Update Gift Type
router.put('/:id', async (req, res) => {
  try {
    const { name, price, description } = req.body;
    const giftType = await GiftType.findByIdAndUpdate(
      req.params.id,
      { name, price, description },
      { new: true }
    );
    if (!giftType) {
      return res.status(404).json({ message: 'Gift type not found' });
    }
    res.status(200).json(giftType);
  } catch (error) {
    console.error('Error updating gift type:', error.message);
    res.status(500).json({ message: 'Error updating gift type', error: error.message });
  }
});

// Initialize default gift types (run once or on server start)
export const initializeGiftTypes = async () => {
  const count = await GiftType.countDocuments();
  if (count === 0) {
    const defaultGiftTypes = [
      { name: 'poem', price: 8, description: 'AI-generated poem' },
      { name: 'voice', price: 12, description: 'Personalized voice message' },
      { name: 'image', price: 15, description: 'Custom artwork' },
      { name: 'song', price: 25, description: 'Personalized song' },
    ];
    await GiftType.insertMany(defaultGiftTypes);
    console.log('Default gift types initialized');
  }
};

// Remove this line:
// initializeGiftTypes();

export default router;
