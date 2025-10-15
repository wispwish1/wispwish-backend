import express from 'express';
import aiService from '../services/aiService.js';
import Gift from '../models/Gift.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import nodemailerService from '../services/nodemailerService.js';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// Optional authentication middleware (same behavior as gift route)
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

    next();
  } catch (error) {
    next();
  }
};

router.post('/generate', optionalAuth, async (req, res) => {
  try {
    const {
      giftType,
      recipientName,
      tone,
      memories,
      genre,
      relationship,
      occasion,
      senderMessage,
      senderName,
      deliveryMethod,
      deliveryEmail,
      scheduledDate,
      price,
      language, // Add language parameter
      buyerEmail,
      scheduledTimezone,
      scheduledOffsetMinutes
    } = req.body;

    console.log('🎵 Received /api/song/generate request:', req.body);

    if (giftType !== 'song') {
      return res.status(400).json({ message: 'This route is only for generating songs' });
    }

    if (!recipientName || !tone) {
      return res.status(400).json({ message: 'recipientName and tone are required' });
    }

    console.log('🎼 Starting song generation process...');
    const generatedContent = await aiService.generateSong({
      giftType,
      recipientName,
      tone,
      memories: memories || [],
      genre: genre || 'pop',
      occasion: occasion || 'special occasion',
      language: language || 'en' // Pass language parameter
    });

    console.log('✅ Song generation completed:', {
      hasLyrics: !!generatedContent.text,
      hasAudio: !!generatedContent.audio,
      taskId: generatedContent.taskId,
      success: generatedContent.success
    });

    const giftDoc = new Gift({
      giftType,
      recipientName,
      tone,
      memories: memories || [],
      genre: genre || '',
      generatedContent: {
        text: generatedContent.text || generatedContent.lyrics,
        lyrics: generatedContent.lyrics || generatedContent.text,
        audio: generatedContent.audio || null,
        audioUrl: generatedContent.audioUrl || null,
        taskId: generatedContent.taskId || null,
        duration: generatedContent.duration || null,
        warning: generatedContent.warning || null,
        isFallback: generatedContent.isFallback || false,
      },
      // Store audio content directly if available for email functionality
      audioContent: generatedContent.audio || null,
      price: price || 10,
      relationship: relationship || 'friend',
      occasion: occasion || 'special occasion',
      senderMessage: senderMessage || '',
      deliveryMethod: deliveryMethod || '',
      deliveryEmail: deliveryEmail || '',
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      scheduledTimezone: scheduledTimezone || '',
      scheduledOffsetMinutes: typeof scheduledOffsetMinutes === 'number' ? scheduledOffsetMinutes : (new Date().getTimezoneOffset() * -1),
    });

    // If scheduled for future, mark as scheduled at creation time
    try {
      const now = new Date();
      if (giftDoc.scheduledDate && new Date(giftDoc.scheduledDate) > now) {
        giftDoc.deliveryStatus = 'scheduled';
        console.log(`📅 [song] Setting deliveryStatus=scheduled on creation for gift ${giftDoc._id} at ${new Date(giftDoc.scheduledDate).toISOString()}`);
      }
    } catch {}

    // Save gift with retry logic for database timeouts
    let saveAttempts = 0;
    const maxSaveAttempts = 5; // Increase retry attempts
    
    while (saveAttempts < maxSaveAttempts) {
      try {
        await giftDoc.save();
        console.log('💾 Gift saved to database with ID:', giftDoc._id);
        break; // Success, exit the loop
      } catch (saveError) {
        saveAttempts++;
        console.error(`❌ Database save attempt ${saveAttempts} failed:`, saveError.message);
        
        if (saveAttempts >= maxSaveAttempts) {
          throw new Error(`Failed to save gift to database after ${maxSaveAttempts} attempts: ${saveError.message}`);
        }
        
        // Wait before retrying with longer delays
        await new Promise(resolve => setTimeout(resolve, 2000 * saveAttempts));
      }
    }

    // Create Payment and Order (align with gift flow)
    const userId = req.user?.id || null;
    const userEmail = req.user?.email || buyerEmail || 'guest@example.com';
    const userName = req.user?.name || senderName || 'Guest';

    let payment, order;
    
    // Save payment with retry logic
    saveAttempts = 0;
    while (saveAttempts < maxSaveAttempts) {
      try {
        payment = new Payment({
          amount: giftDoc.price,
          userId,
          method: 'stripe',
          status: 'pending',
          buyerEmail: userEmail,
          buyerName: userName,
        });

        await payment.save();
        break; // Success, exit the loop
      } catch (saveError) {
        saveAttempts++;
        console.error(`❌ Payment save attempt ${saveAttempts} failed:`, saveError.message);
        
        if (saveAttempts >= maxSaveAttempts) {
          throw new Error(`Failed to save payment after ${maxSaveAttempts} attempts: ${saveError.message}`);
        }
        
        // Wait before retrying with longer delays
        await new Promise(resolve => setTimeout(resolve, 2000 * saveAttempts));
      }
    }

    // Save order with retry logic
    saveAttempts = 0;
    while (saveAttempts < maxSaveAttempts) {
      try {
        order = new Order({
          userId,
          giftId: giftDoc._id,
          type: giftType,
          payment: payment._id,
          paymentStatus: 'pending',
          price: giftDoc.price
        });

        await order.save();
        break; // Success, exit the loop
      } catch (saveError) {
        saveAttempts++;
        console.error(`❌ Order save attempt ${saveAttempts} failed:`, saveError.message);
        
        if (saveAttempts >= maxSaveAttempts) {
          throw new Error(`Failed to save order after ${maxSaveAttempts} attempts: ${saveError.message}`);
        }
        
        // Wait before retrying with longer delays
        await new Promise(resolve => setTimeout(resolve, 2000 * saveAttempts));
      }
    }

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
          generatedContent: generatedContent?.text || generatedContent?.lyrics || '',
          audioContent: generatedContent?.audioUrl || (generatedContent?.audio ? `data:audio/mpeg;base64,${generatedContent.audio}` : null),
          buyerName: userName,
          giftId: giftDoc._id
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
      // Continue without failing the request
    }

    // Return structured response for frontend
    const response = {
      success: true,
      giftId: giftDoc._id,
      generatedContent: {
        text: generatedContent.text || generatedContent.lyrics,
        lyrics: generatedContent.lyrics || generatedContent.text,
        audio: generatedContent.audio,
        audioUrl: generatedContent.audioUrl,
        duration: generatedContent.duration,
        taskId: generatedContent.taskId,
        isFallback: generatedContent.isFallback || false,
      },
      taskId: generatedContent.taskId || null,
      warning: generatedContent.warning || null,
      orderId: order._id
    };

    console.log('📤 Sending response to frontend:', {
      hasAudio: !!response.generatedContent.audio,
      hasLyrics: !!response.generatedContent.lyrics,
      taskId: response.taskId
    });

    res.json(response);
    
  } catch (error) {
    console.error('❌ Error in /api/song/generate:', error.message);
    console.error('Error stack:', error.stack);
    
    // Handle database timeout errors specifically
    if (error.name === 'MongoNetworkTimeoutError' || error.message.includes('timed out') || error.message.includes('connection')) {
      return res.status(504).json({
        success: false,
        message: 'Database connection timed out. The song was generated successfully but we had trouble saving it. Please try again.',
        error: 'database_timeout',
        // Include the generated content so frontend can handle it gracefully
        generatedContent: {
          text: generatedContent?.text || generatedContent?.lyrics || '',
          lyrics: generatedContent?.lyrics || generatedContent?.text || '',
          audioUrl: generatedContent?.audioUrl || null,
          duration: generatedContent?.duration || null,
          taskId: generatedContent?.taskId || null
        }
      });
    }
    
    // Handle specific error types
    if (error.message.includes('HTTP 403') || error.message.includes('authenticate')) {
      return res.status(403).json({
        success: false,
        message: 'Failed to authenticate with AI services. Please check API keys or contact support.',
        error: 'authentication_failed'
      });
    }
    
    if (error.message.includes('HTTP 503') || error.message.includes('unavailable')) {
      return res.status(503).json({
        success: false,
        message: 'Music generation service is temporarily unavailable. Please try again later.',
        retryAfter: 300,
        error: 'service_unavailable'
      });
    }
    
    if (error.message.includes('timeout')) {
      return res.status(408).json({
        success: false,
        message: 'Song generation request timed out. Please try again.',
        error: 'timeout'
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: error.message,
      error: 'internal_error'
    });
  }
});

// Poll task status and return audio when ready
router.get('/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    if (!taskId) return res.status(400).json({ message: 'taskId is required' });

    const taskData = await aiService.pollTaskStatus(taskId);
    if (!taskData?.audio_url) {
      return res.status(202).json({ message: 'Processing', taskId });
    }

    const audioResponse = await (await import('axios')).default.get(taskData.audio_url, { responseType: 'arraybuffer' });
    const base64 = Buffer.from(audioResponse.data).toString('base64');

    // Optionally update any gift that has this taskId
    const gift = await Gift.findOne({ 'generatedContent.taskId': taskId });
    if (gift) {
      gift.generatedContent.audio = base64;
      gift.audioContent = base64;
      await gift.save();
    }

    res.json({
      taskId,
      generatedContent: {
        audio: base64,
        audioUrl: `data:audio/mpeg;base64,${base64}`,
      }
    });
  } catch (error) {
    console.error(`Error in /api/song/task/${req.params.taskId}:`, JSON.stringify(error.response?.data || error.message, null, 2));
    
    // Handle database timeout errors
    if (error.name === 'MongoNetworkTimeoutError' || error.message.includes('timed out') || error.message.includes('connection')) {
      return res.status(504).json({ 
        message: 'Database connection timed out while updating gift. Please try again.', 
        taskId: req.params.taskId,
        error: 'database_timeout'
      });
    }
    
    res.status(500).json({ message: error.message, taskId: req.params.taskId });
  }
});

export default router;














// import express from 'express';
// import Gift from '../models/Gift.js';
// import aiService from '../services/aiService.js';
// import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

// const router = express.Router();

// router.post('/generate', authenticateToken, authorizeRoles('customer', 'admin'),async (req, res) => {
//   try {
//     console.log('Received /api/song/generate request:', JSON.stringify(req.body, null, 2));
    
//     const giftData = {
//       ...req.body,
//       generatedContent: await aiService.generateSong(req.body),
//       paymentStatus: 'pending',
//     };

//     const gift = new Gift(giftData);
//     await gift.save();

//     res.status(200).json({
//       giftId: gift._id,
//       generatedContent: giftData.generatedContent,
//       warning: giftData.generatedContent.warning,
//       taskId: giftData.generatedContent.taskId,
//     });
//   } catch (error) {
//     console.error('Error in /api/song/generate:', JSON.stringify(error.response?.data || error.message, null, 2));
//     res.status(500).json({
//       message: error.message,
//       taskId: giftData?.generatedContent?.taskId || error.taskId || req.body.taskId,
//     });
//   }
// });

// router.get('/task/:taskId', async (req, res) => {
//   try {
//     const taskId = req.params.taskId;
//     console.log(`Received /api/song/task/${taskId} request`);
    
//     const audioData = await aiService.pollTaskStatus(taskId);
    
//     const gift = await Gift.findOne({ 'generatedContent.taskId': taskId });
//     if (!gift) {
//       throw new Error('No gift found for this task ID');
//     }

//     if (audioData.audio_url) {
//       const audioResponse = await axios.get(audioData.audio_url, {
//         responseType: 'arraybuffer',
//       });
      
//       gift.generatedContent.audio = Buffer.from(audioResponse.data).toString('base64');
//       await gift.save();
      
//       res.status(200).json({
//         giftId: gift._id,
//         generatedContent: gift.generatedContent,
//       });
//     } else {
//       throw new Error('No audio URL in task response');
//     }
//   } catch (error) {
//     console.error(`Error in /api/song/task/${taskId}:`, JSON.stringify(error.response?.data || error.message, null, 2));
//     res.status(500).json({
//       message: error.message,
//       taskId,
//     });
//   }
// });

// export default router;