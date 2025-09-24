import express from 'express';
import axios from 'axios';
import aiService from '../services/aiService.js';
import Gift from '../models/Gift.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import nodemailerService from '../services/nodemailerService.js';
import jwt from 'jsonwebtoken'; // Added for optionalAuth middleware
import User from '../models/User.js'; // Added for optionalAuth middleware
import VoiceStyle from '../models/VoiceStyle.js';
import WishKnot from '../models/WishKnot.js'; // Add WishKnot model

const router = express.Router();

// Optional authentication middleware
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      const user = await User.findById(decoded.userId).select('-password');
      if (user) {
        req.user = user;
      }
    }

    // Always proceed, even without auth
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

// Generate gift route
router.post('/generate', optionalAuth, async (req, res) => {
  try {
    console.log('Received /api/gift/generate request:', JSON.stringify(req.body, null, 2));

    const {
      giftType,
      recipientName,
      tone,
      memories,
      relationship,
      occasion,
      senderMessage,
      deliveryMethod,
      deliveryEmail,
      scheduledDate,
      senderName,
      buyerEmail,
      voiceStyleId,
      scheduledTimezone,
      scheduledOffsetMinutes,
    } = req.body;

    // Handle combo gift type (Full Experience) - generate all components
    let generatedContent;
    if (giftType === 'combo') {
      console.log('🎨 Generating Full Experience (combo) gift with all components...');
      
      // Generate all components for combo gift
      const [poemContent, voiceContent, illustrationContent, videoContent] = await Promise.all([
        aiService.generateContent({
          giftType: 'poem',
          recipientName,
          tone,
          memories: memories || [],
          relationship,
          occasion
        }),
        aiService.generateContent({
          giftType: 'voice',
          recipientName,
          tone,
          memories: memories || [],
          relationship,
          occasion
        }),
        aiService.generateContent({
          giftType: 'illustration',
          recipientName,
          tone,
          memories: memories || [],
          relationship,
          occasion
        }),
        aiService.generateContent({
          giftType: 'video',
          recipientName,
          tone,
          memories: memories || [],
          relationship,
          occasion
        })
      ]);
      
      // Combine all content into a single response
      generatedContent = {
        type: 'combo',
        poem: poemContent,
        voice: voiceContent,
        illustration: illustrationContent,
        video: videoContent,
        text: `Full Experience Gift for ${recipientName}`,
        isCombo: true
      };
      
      console.log('✅ Full Experience gift generated with all components');
    } else {
      // Generate content using AI service for single gift types
      generatedContent = await aiService.generateContent({
        giftType,
        recipientName,
        tone,
        memories: memories || [],
        relationship,
        occasion,
        voiceStyleId,
      });
    }

    console.log('Generated content:', generatedContent);

    // Format the response for frontend consistency (handle voice/video/wishknot/combo)
    let formattedContent = generatedContent;
    if (giftType === 'combo' && generatedContent?.isCombo) {
      // Format combo content with all components
      formattedContent = {
        text: generatedContent.text,
        type: 'combo',
        isCombo: true,
        components: {
          poem: typeof generatedContent.poem === 'object' ? generatedContent.poem : { text: generatedContent.poem },
          voice: generatedContent.voice,
          illustration: generatedContent.illustration,
          video: generatedContent.video
        }
      };
      
      // Ensure voice component is properly formatted
      if (formattedContent.components.voice && typeof formattedContent.components.voice === 'object') {
        // If voice has audio data, format it properly
        if (formattedContent.components.voice.audio) {
          formattedContent.components.voice = {
            ...formattedContent.components.voice,
            audioUrl: `data:audio/mpeg;base64,${formattedContent.components.voice.audio}`
          };
        }
        // If voice has audioUrl already, keep it as is
        else if (formattedContent.components.voice.audioUrl) {
          formattedContent.components.voice = {
            ...formattedContent.components.voice
          };
        }
      }
    } else if (giftType === 'voice' && generatedContent?.audio) {
      const audioUrl = `data:audio/mpeg;base64,${generatedContent.audio}`;
      formattedContent = {
        text: generatedContent.text,
        audioUrl: audioUrl, // Added top-level audioUrl for frontend simplicity
        voiceMessage: {
          script: generatedContent.text,
          audioUrl: audioUrl,
          duration: null // Duration not available from base64
        }
      };
    } else if (giftType === 'video' && (generatedContent?.videoUrl || generatedContent?.error)) {
      formattedContent = {
        text: generatedContent.text || generatedContent.script,
        videoUrl: generatedContent.videoUrl,
        script: generatedContent.script || generatedContent.text,
        description: generatedContent.description || `Video tribute content for ${recipientName}`,
        error: generatedContent.error || null,
        type: 'video'
      };
    } else if (giftType === 'wishknot' && (generatedContent?.animationUrl || generatedContent?.message)) {
      // For WishKnot, we store placeholder in Gift.generatedContent for security
      // But we return the actual message in response for creator preview
      formattedContent = {
        text: 'WishKnot created successfully - message stored securely',
        animationUrl: generatedContent.animationUrl || null,
        knotType: generatedContent.knotType || 'Heart Knot',
        message: generatedContent.message || generatedContent.text || 'Your personalized message has been created', // Return actual message for creator preview
        previewMessage: generatedContent.message || generatedContent.text, // Add preview field for frontend
        isWishKnot: true // Flag to identify WishKnot content
      };
    }

    console.log('Formatted content for response:', formattedContent); // Debug log

    const giftDoc = new Gift({
      giftType,
      recipientName,
      senderName: senderName || 'Someone special',
      tone,
      memories: memories || [],
      relationship: relationship || 'friend',
      occasion: occasion || 'special occasion',
      generatedContent: typeof formattedContent === 'object' ? formattedContent : { text: formattedContent },
      audioContent: formattedContent?.components?.voice?.audioUrl || formattedContent?.voiceMessage?.audioUrl || null,
      videoContent: formattedContent?.components?.video?.videoUrl || formattedContent?.videoUrl || null, // Add video content
      senderMessage: senderMessage || '',
      deliveryMethod: deliveryMethod || '',
      deliveryEmail: deliveryEmail || '',
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      price: getPrice(giftType),
      scheduledTimezone: scheduledTimezone || req.body.timezone || '',
      scheduledOffsetMinutes: typeof scheduledOffsetMinutes === 'number' ? scheduledOffsetMinutes : (new Date().getTimezoneOffset() * -1),
      voiceStyleId: voiceStyleId || null,
    });

    // If scheduled for future, mark as scheduled at creation time
    try {
      const now = new Date();
      if (giftDoc.scheduledDate && new Date(giftDoc.scheduledDate) > now) {
        giftDoc.deliveryStatus = 'scheduled';
        console.log(`📅 Setting deliveryStatus=scheduled on creation for gift ${giftDoc._id} at ${new Date(giftDoc.scheduledDate).toISOString()}`);
      }
    } catch {}

    await giftDoc.save();
    console.log('Gift saved with audioContent:', !!giftDoc.audioContent);
    
    // Create WishKnot record for WishKnot gifts
    let wishKnotData = null;
    if (giftType === 'wishknot' && formattedContent) {
      try {
        console.log('🪢 Creating WishKnot record...');
        
        const wishKnot = new WishKnot({
          giftId: giftDoc._id,
          senderName: senderName || 'Someone special',
          recipientName,
          recipientEmail: deliveryEmail,
          personalizedMessage: generatedContent.message || generatedContent.text, // Use original generatedContent, not formattedContent
          tiedAnimationUrl: formattedContent.animationUrl,
          untieAnimationUrl: formattedContent.untieAnimationUrl || formattedContent.animationUrl,
          knotType: formattedContent.knotType || 'Heart Knot',
          tone,
          relationship: relationship || 'friend',
          occasion: occasion || 'special occasion',
          senderMessage,
          scheduledRevealDate: scheduledDate ? new Date(scheduledDate) : null,
          visualMetadata: formattedContent.metadata || {}
        });
        
        await wishKnot.save();
        
        wishKnotData = {
          knotId: wishKnot.knotId,
          accessToken: wishKnot.accessToken,
          viewUrl: `/api/wishknot/view/${wishKnot.accessToken}`,
          untieUrl: `/api/wishknot/untie/${wishKnot.accessToken}`
        };
        
        console.log('✅ WishKnot record created successfully:', wishKnot.knotId);
      } catch (wishKnotError) {
        console.error('❌ Error creating WishKnot record:', wishKnotError.message);
        // Continue with gift creation even if WishKnot fails
      }
    }

    // Use authenticated user if available, otherwise use guest
    const userId = req.user?.id || null;
    const userEmail = req.user?.email || buyerEmail || 'guest@example.com';
    const userName = req.user?.name || senderName || 'Guest';

    const payment = new Payment({
      amount: giftDoc.price,
      userId,
      method: 'stripe',
      status: 'pending',
      buyerEmail: userEmail,
      buyerName: userName,
    });

    await payment.save();

    const order = new Order({
      userId,
      giftId: giftDoc._id,
      type: giftType,
      payment: payment._id,
      paymentStatus: 'pending',
      price: giftDoc.price
    });

    await order.save();

    // Send order confirmation email to BUYER
    try {
      if (userEmail && userEmail !== 'guest@example.com') {
        console.log('Sending confirmation email to buyer:', userEmail);
        const emailResult = await nodemailerService.sendOrderConfirmation(userEmail, {
          orderId: order._id.toString().slice(-6),
          giftType,
          recipientName,
          recipientEmail: deliveryEmail,
          price: giftDoc.price,
          generatedContent: typeof formattedContent === 'object' ? formattedContent.text || formattedContent : formattedContent,
          audioContent: formattedContent?.voiceMessage?.audioUrl || null,
          buyerName: userName,
          giftId: giftDoc._id // Add giftId for WishKnot message lookup
        });

        if (emailResult.success) {
          console.log('Order confirmation email sent to buyer successfully:', emailResult.messageId);
        } else {
          console.error('Failed to send order confirmation email to buyer:', emailResult.error);
        }
      } else {
        console.log('No valid buyer email available for confirmation');
      }
    } catch (emailError) {
      console.error('Error sending order confirmation to buyer:', emailError);
      // Don't throw the error, just log it and continue
    }

    console.log('Gift created successfully. Gift email will be sent after payment completion.');

    // Return response with giftId, formattedContent, orderId, and WishKnot data
    const response = { 
      giftId: giftDoc._id, 
      generatedContent: formattedContent, 
      orderId: order._id 
    };
    
    // Add WishKnot specific data if applicable
    if (wishKnotData) {
      response.wishKnot = wishKnotData;
    }
    
    res.json(response);
  } catch (error) {
    console.error('Error in /api/gift/generate:', error);
    // Send a more detailed error message to help with debugging
    res.status(500).json({ 
      message: 'Failed to generate gift. Please try again.', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Create gift route
router.post('/create', async (req, res) => {
  try {
    const newGift = await Gift.create(req.body);

    const payment = await Payment.create({
      amount: newGift.price,
      status: 'pending'
    });

    const order = await Order.create({
      giftId: newGift._id,
      paymentStatus: 'pending',
      payment: payment._id
    });

    res.json({ giftId: newGift._id, orderId: order._id });
  } catch (error) {
    console.error('Error creating gift:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get active voice styles
router.get('/voice-styles', async (req, res) => {
  try {
    const styles = await VoiceStyle.find({ isActive: true })
      .select('_id name gender accent isDefault previewUrl')
      .sort({ isDefault: -1, createdAt: -1 });
    res.json(styles);
  } catch (error) {
    console.error('Error fetching voice styles:', error);
    res.status(500).json({ message: 'Failed to fetch voice styles' });
  }
});

// Get gift by ID
router.get('/:id', async (req, res) => {
  console.log('Reached /api/gift/:id');
  try {
    const gift = await Gift.findById(req.params.id);
    if (!gift) {
      return res.status(404).json({ message: 'Gift not found' });
    }
    res.json(gift);
  } catch (error) {
    console.error('Error in /api/gift/:id:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// Update payment status
router.post('/update-payment/:orderId', async (req, res) => {
  const { status } = req.body;
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const payment = await Payment.findById(order.payment);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    payment.status = status;
    await payment.save();

    order.paymentStatus = status;
    await order.save();

    const gift = await Gift.findById(order.giftId);
    if (!gift) {
      return res.status(404).json({ message: 'Gift not found' });
    }

    gift.paymentStatus = status;
    await gift.save();

    // Send or schedule gift email after successful payment
    if (status === 'completed' && gift.deliveryMethod === 'email' && gift.deliveryEmail) {
      try {
        const now = new Date();
        const scheduledDate = gift.scheduledDate ? new Date(gift.scheduledDate) : now;

        // If scheduled for future, mark as scheduled and skip immediate send
        if (scheduledDate > now) {
          gift.deliveryStatus = 'scheduled';
          await gift.save();
          console.log(`📅 Gift marked as scheduled for ${scheduledDate.toISOString()} (gift: ${gift._id})`);
        } else {
          // Time to send now
          if (gift.giftType === 'wishknot') {
            // Find the associated WishKnot record
            const wishKnot = await WishKnot.findOne({ giftId: gift._id });
            
            if (wishKnot) {
              const wishKnotEmailResult = await nodemailerService.sendWishKnotEmail({
                recipientEmail: gift.deliveryEmail,
                recipientName: gift.recipientName,
                senderName: gift.senderName,
                knotType: wishKnot.knotType,
                occasion: gift.occasion,
                giftId: gift._id,
                accessToken: wishKnot.accessToken,
                viewUrl: `${process.env.BASE_URL || 'http://127.0.0.1:5500'}/wishknot-view.html?giftId=${gift._id}&token=${wishKnot.accessToken}`,
                scheduledRevealDate: wishKnot.scheduledRevealDate
              });
              
              if (wishKnotEmailResult.success) {
                console.log('WishKnot email sent to recipient after payment:', wishKnotEmailResult.messageId);
                await wishKnot.logInteraction('email_sent', { recipientEmail: gift.deliveryEmail });
                gift.deliveryStatus = 'delivered';
                gift.deliveredAt = new Date();
                await gift.save();
              } else {
                console.error('Failed to send WishKnot email after payment:', wishKnotEmailResult.error);
                gift.deliveryStatus = 'failed';
                await gift.save();
              }
            } else {
              console.error('WishKnot record not found for gift:', gift._id);
              gift.deliveryStatus = 'failed';
              await gift.save();
            }
          } else {
            // Send regular gift email for other gift types
            const giftResult = await nodemailerService.sendGiftEmail({
              giftType: gift.giftType,
              recipientName: gift.recipientName,
              senderMessage: gift.senderMessage,
              generatedContent: gift.generatedContent,
              audioContent: gift.audioContent,
              scheduledDate: gift.scheduledDate,
              deliveryEmail: gift.deliveryEmail,
              occasion: gift.occasion,
            });
            
            if (giftResult.success) {
              console.log('Gift email sent to recipient after payment:', giftResult.messageId);
              gift.deliveryStatus = 'delivered';
              gift.deliveredAt = new Date();
              await gift.save();
            } else {
              console.error('Failed to send gift email after payment:', giftResult.error);
              gift.deliveryStatus = 'failed';
              await gift.save();
            }
          }
        }
      } catch (giftError) {
        console.error('Error processing post-payment gift handling:', giftError);
      }
    }

    res.json({ message: 'Payment status updated', order });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check RunwayML account status
router.get('/runway-status', async (req, res) => {
  try {
    if (!process.env.RUNWAY_API_KEY || process.env.RUNWAY_API_KEY === 'your_runway_api_key_here') {
      return res.json({ 
        status: 'not_configured',
        message: 'RunwayML API key not configured'
      });
    }
    
    // Try to get account info
    const response = await axios.get('https://api.dev.runwayml.com/v1/account', {
      headers: {
        'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
        'X-Runway-Version': '2024-11-06',
      },
      timeout: 10000
    });
    
    res.json({
      status: 'active',
      account: response.data,
      message: 'RunwayML API is working'
    });
  } catch (error) {
    console.error('RunwayML status check failed:', error.message);
    res.json({
      status: 'error',
      error: error.response?.data?.error || error.message,
      message: 'RunwayML API check failed'
    });
  }
});

// Helper function to determine gift price
function getPrice(giftType) {
  switch (giftType) {
    case 'voice': return 10;
    case 'song': return 10;
    case 'image': return 10;
    case 'illustration': return 10;
    case 'video': return 12;
    case 'poem': return 8;
    case 'wishknot': return 9;
    case 'letter': return 8;
    case 'shortStory': return 10;
    case 'combo': return 22; // Full Experience price
    default: return 8;
  }
}

export default router;