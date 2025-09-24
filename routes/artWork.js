
import express from 'express';
import aiService from '../services/aiService.js';
import Gift from '../models/Gift.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import nodemailerService from '../services/nodemailerService.js';

const router = express.Router();

// Helper function to get price based on gift type
function getPrice(giftType) {
  const prices = {
    'image': 12,
    'illustration': 15,  // Add illustration pricing
    'poem': 8,
    'voice': 10
  };
  return prices[giftType] || 8;
}

router.post('/generate', async (req, res) => {
  try {
    const { gift, buyerEmail } = req.body;
    console.log('Received /api/artwork/generate request:', req.body);

    if (gift.giftType === 'image' || gift.giftType === 'illustration') {
      const images = await aiService.generateImages(gift);
      const giftDoc = new Gift({
        giftType: gift.giftType,
        senderName: gift.senderName || 'Someone special',
        recipientName: gift.recipientName,
        tone: gift.tone,
        memories: gift.memories,
        images,
        deliveryMethod: gift.deliveryMethod || 'email',
        deliveryEmail: gift.deliveryEmail || '',
        buyerEmail: buyerEmail || '', // Store buyer email
        senderMessage: gift.senderMessage || '',
        occasion: gift.occasion || 'special occasion',
        relationship: gift.relationship || 'friend',
        scheduledDate: gift.scheduledDate ? new Date(gift.scheduledDate) : undefined, // یہ line add کریں
        scheduledTimezone: gift.scheduledTimezone || '',
        scheduledOffsetMinutes: typeof gift.scheduledOffsetMinutes === 'number' ? gift.scheduledOffsetMinutes : (new Date().getTimezoneOffset() * -1),
        price: getPrice(gift.giftType)
      });
      // If scheduled for future, mark as scheduled at creation time
      try {
        const now = new Date();
        if (giftDoc.scheduledDate && new Date(giftDoc.scheduledDate) > now) {
          giftDoc.deliveryStatus = 'scheduled';
          console.log(`📅 [artwork] Setting deliveryStatus=scheduled on creation for gift ${giftDoc._id} at ${new Date(giftDoc.scheduledDate).toISOString()}`);
        }
      } catch {}

      await giftDoc.save();
      
      // Create Order and Payment records (same as main gift route)
      const userId = req.user?.id || null; // Optional user ID
      
      const payment = new Payment({
        amount: giftDoc.price,
        userId: userId,
        method: 'stripe',
        status: 'pending'
      });
      
      await payment.save();
      
      const order = new Order({
        userId: userId,
        giftId: giftDoc._id,
        type: gift.giftType,
        payment: payment._id,
        paymentStatus: 'pending',
        price: giftDoc.price
      });
      
      await order.save();

      // Note: Order confirmation email will be sent after image selection
      console.log('Images generated, waiting for user selection before sending confirmation email');
      
      // Return both images and giftId
      res.json({
        images,
        giftId: giftDoc._id,
        orderId: order._id
      });
    } else {
      return res.status(400).json({ message: 'Use /api/gift/generate for non-image/illustration gifts or /api/song/generate for songs' });
    }
  } catch (error) {
    console.error('Error in /api/artwork/generate:', error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post('/select', async (req, res) => {
  try {
    const { imageId } = req.body;
    console.log('Image selection request:', { imageId });
    
    // Find the gift that contains this image
    const gift = await Gift.findOne({ 'images._id': imageId });
    if (!gift) {
      return res.status(404).json({ message: 'Gift with this image not found' });
    }
    
    // Check if image is already selected to prevent duplicate emails
    if (gift.selectedImageId === imageId) {
      console.log('Image already selected, skipping email send');
      return res.json({ 
        success: true,
        message: 'Image already selected', 
        imageId: imageId,
        giftId: gift._id,
        selectedImageUrl: gift.images.find(img => img._id === imageId)?.url
      });
    }
    
    // Find the selected image details
    const selectedImage = gift.images.find(img => img._id === imageId);
    if (!selectedImage) {
      return res.status(404).json({ message: 'Selected image not found in gift' });
    }
    
    // Mark the selected image in the gift
    gift.selectedImageId = imageId;
    await gift.save();
    
    console.log('Image selected successfully:', imageId, 'for gift:', gift._id);
    
    // Now send the confirmation email to buyer after image selection
    const order = await Order.findOne({ giftId: gift._id });
    if (order) {
      // Get buyer email from gift data
      const buyerEmailFromGift = gift.buyerEmail;
      
      if (buyerEmailFromGift && buyerEmailFromGift !== 'user@example.com') {
        try {
          console.log('Sending confirmation email to buyer after image selection:', buyerEmailFromGift);
          
          const emailResult = await nodemailerService.sendOrderConfirmation(buyerEmailFromGift, {
            orderId: order._id.toString().slice(-6),
            giftType: gift.giftType,
            recipientName: gift.recipientName,
            recipientEmail: gift.deliveryEmail || 'Not provided',
            price: gift.price,
            generatedContent: selectedImage.url, // Pass the selected image URL
            buyerName: gift.senderName || 'Friend',
            giftId: gift._id
          });
          
          if (emailResult.success) {
            console.log('Order confirmation email sent to buyer successfully after selection:', emailResult.messageId);
          } else {
            console.error('Failed to send order confirmation email to buyer after selection:', emailResult.error);
          }
        } catch (emailError) {
          console.error('Error sending order confirmation to buyer after selection:', emailError);
        }
      } else {
        console.log('No valid buyer email available for confirmation');
      }
    }
    
    // Return proper response with both imageId and giftId
    res.json({ 
      success: true,
      message: 'Image selected successfully', 
      imageId: imageId,
      giftId: gift._id,
      selectedImageUrl: selectedImage.url
    });
  } catch (error) {
    console.error('Error in /api/artwork/select:', error.message);
    res.status(500).json({ message: error.message });
  }
});

export default router;