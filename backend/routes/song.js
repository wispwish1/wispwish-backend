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

    console.log('Received /api/song/generate request:', req.body);

    if (giftType !== 'song') {
      return res.status(400).json({ message: 'This route is only for generating songs' });
    }

    if (!recipientName || !tone) {
      return res.status(400).json({ message: 'recipientName and tone are required' });
    }

    const generatedContent = await aiService.generateSong({
      giftType,
      recipientName,
      tone,
      memories: memories || [],
      genre: genre || 'pop',
      occasion: occasion || 'special occasion',
    });

    const giftDoc = new Gift({
      giftType,
      recipientName,
      tone,
      memories: memories || [],
      genre: genre || '',
      generatedContent: {
        text: generatedContent.text,
        audio: generatedContent.audio || null,
      },
      price: price || 25,
      relationship: relationship || 'friend',
      occasion: occasion || 'special occasion',
      senderMessage: senderMessage || '',
      deliveryMethod: deliveryMethod || '',
      deliveryEmail: deliveryEmail || '',
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
    });

    await giftDoc.save();
    res.json({
      giftId: giftDoc._id,
      generatedContent,
      warning: generatedContent.audio ? null : 'Audio generation failed due to temporary server issues. Text-based song idea provided instead.',
    });
  } catch (error) {
    console.error('Error in /api/song/generate:', error.message);
    if (error.message.includes('HTTP 403')) {
      return res.status(403).json({
        message: 'Failed to authenticate with API. Please check your API keys or contact support.',
      });
    }
    if (error.message.includes('HTTP 503')) {
      return res.status(503).json({
        message: 'Music generation service is temporarily unavailable. Please try again later or contact support.',
        retryAfter: 300,
      });
    }
    res.status(500).json({ message: error.message });
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