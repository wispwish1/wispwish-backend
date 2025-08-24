
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
    'poem': 8,
    'voice': 10
  };
  return prices[giftType] || 8;
}

router.post('/generate', async (req, res) => {
  try {
    const { gift, buyerEmail } = req.body;
    console.log('Received /api/artwork/generate request:', req.body);

    if (gift.giftType === 'image') {
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
        senderMessage: gift.senderMessage || '',
        occasion: gift.occasion || 'special occasion',
        relationship: gift.relationship || 'friend',
        scheduledDate: gift.scheduledDate ? new Date(gift.scheduledDate) : undefined, // یہ line add کریں
        price: getPrice(gift.giftType)
      });
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

      // Send order confirmation email to BUYER (if user is authenticated)
      const emailAddress = req.user?.email || buyerEmail;
      if (emailAddress && emailAddress !== 'user@example.com') { // Avoid sending to dummy email
        try {
          console.log('Sending confirmation email to buyer:', emailAddress);
          
          const emailResult = await nodemailerService.sendOrderConfirmation(emailAddress, {
            orderId: order._id.toString().slice(-6),
            giftType: gift.giftType,
            recipientName: gift.recipientName,
            recipientEmail: gift.deliveryEmail || 'Not provided', // Show recipient email properly
            price: giftDoc.price,
            generatedContent: 'Custom artwork images generated',
            buyerName: req.user?.name || 'Friend'
          });
          
          if (emailResult.success) {
            console.log('Order confirmation email sent to buyer successfully:', emailResult.messageId);
          } else {
            console.error('Failed to send order confirmation email to buyer:', emailResult.error);
          }
        } catch (emailError) {
          console.error('Error sending order confirmation to buyer:', emailError);
        }
      } else {
        console.log('No buyer email available for confirmation');
      }
      
      // Return both images and giftId
      res.json({
        images,
        giftId: giftDoc._id,
        orderId: order._id
      });
    } else {
      return res.status(400).json({ message: 'Use /api/gift/generate for non-image gifts or /api/song/generate for songs' });
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
    
    // Find the selected image details
    const selectedImage = gift.images.find(img => img._id === imageId);
    if (!selectedImage) {
      return res.status(404).json({ message: 'Selected image not found in gift' });
    }
    
    // Mark the selected image in the gift
    gift.selectedImageId = imageId;
    await gift.save();
    
    console.log('Image selected successfully:', imageId, 'for gift:', gift._id);
    
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