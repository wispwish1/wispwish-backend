import express from 'express';
import aiService from '../services/aiService.js';
import Gift from '../models/Gift.js';

const router = express.Router();

router.post('/generate', async (req, res) => {
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
      deliveryMethod,
      deliveryEmail,
      scheduledDate,
      price,
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
      price: price || 25,
      relationship: relationship || 'friend',
      occasion: occasion || 'special occasion',
      senderMessage: senderMessage || '',
      deliveryMethod: deliveryMethod || '',
      deliveryEmail: deliveryEmail || '',
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      scheduledTimezone: req.body.scheduledTimezone || '',
      scheduledOffsetMinutes: typeof req.body.scheduledOffsetMinutes === 'number' ? req.body.scheduledOffsetMinutes : (new Date().getTimezoneOffset() * -1),
    });

    // If scheduled for future, mark as scheduled at creation time
    try {
      const now = new Date();
      if (giftDoc.scheduledDate && new Date(giftDoc.scheduledDate) > now) {
        giftDoc.deliveryStatus = 'scheduled';
        console.log(`📅 [song] Setting deliveryStatus=scheduled on creation for gift ${giftDoc._id} at ${new Date(giftDoc.scheduledDate).toISOString()}`);
      }
    } catch {}

    await giftDoc.save();
    console.log('💾 Gift saved to database with ID:', giftDoc._id);

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