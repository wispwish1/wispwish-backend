import express from 'express';
import WishKnot from '../models/WishKnot.js';
import Gift from '../models/Gift.js';
import aiService from '../services/aiService.js';
import nodemailerService from '../services/nodemailerService.js';

const router = express.Router();

// Create a new WishKnot (called after gift generation)
router.post('/create', async (req, res) => {
  try {
    console.log('🪢 Creating WishKnot from gift data...');
    
    const {
      giftId,
      recipientName,
      recipientEmail,
      senderName,
      tone = 'heartfelt',
      relationship = 'friend',
      occasion = 'special occasion',
      memories = [],
      senderMessage = '',
      scheduledRevealDate = null
    } = req.body;

    // Validate required fields
    if (!giftId || !recipientName || !senderName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: giftId, recipientName, senderName'
      });
    }

    // Verify the gift exists
    const gift = await Gift.findById(giftId);
    if (!gift) {
      return res.status(404).json({
        success: false,
        message: 'Gift not found'
      });
    }

    // Generate the WishKnot content
    const wishknotContent = await aiService.generateContent({
      giftType: 'wishknot',
      recipientName,
      tone,
      memories,
      relationship,
      occasion,
      senderMessage
    });

    console.log('🪢 WishKnot content generated:', wishknotContent);

    // Create WishKnot record
    const wishKnot = new WishKnot({
      giftId,
      senderName,
      recipientName,
      recipientEmail,
      personalizedMessage: wishknotContent.message,
      tiedAnimationUrl: wishknotContent.animationUrl,
      untieAnimationUrl: wishknotContent.untieAnimationUrl || wishknotContent.animationUrl,
      knotType: wishknotContent.knotType || 'Heart Knot',
      tone,
      relationship,
      occasion,
      senderMessage,
      scheduledRevealDate: scheduledRevealDate ? new Date(scheduledRevealDate) : null,
      visualMetadata: wishknotContent.metadata || {}
    });

    await wishKnot.save();

    console.log('✅ WishKnot created successfully:', wishKnot.knotId);

    res.json({
      success: true,
      wishKnot: {
        knotId: wishKnot.knotId,
        accessToken: wishKnot.accessToken,
        viewUrl: `${process.env.BASE_URL || 'http://localhost:5001'}/wishknot-view.html?giftId=${wishKnot.giftId}&token=${wishKnot.accessToken}`,
        untieUrl: `/api/wishknot/untie/${wishKnot.accessToken}`,
        state: wishKnot.state,
        tiedAnimationUrl: wishKnot.tiedAnimationUrl,
        message: 'WishKnot has been tied with your intention'
      }
    });

  } catch (error) {
    console.error('❌ Error creating WishKnot:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create WishKnot',
      error: error.message
    });
  }
});

// View a WishKnot (tied state) - public endpoint with access token
router.get('/view/:accessToken', async (req, res) => {
  try {
    const { accessToken } = req.params;
    
    console.log('👀 Viewing WishKnot with token:', accessToken.substring(0, 8) + '...');

    const wishKnot = await WishKnot.findByAccessToken(accessToken);
    
    if (!wishKnot) {
      return res.status(404).json({
        success: false,
        message: 'WishKnot not found'
      });
    }

    // Increment view count
    await wishKnot.incrementView();

    // Check if scheduled reveal
    const now = new Date();
    const canReveal = !wishKnot.scheduledRevealDate || now >= wishKnot.scheduledRevealDate;

    res.json({
      success: true,
      wishKnot: {
        knotId: wishKnot.knotId,
        recipientName: wishKnot.recipientName,
        senderName: wishKnot.senderName,
        state: wishKnot.state,
        knotType: wishKnot.knotType,
        tone: wishKnot.tone,
        occasion: wishKnot.occasion,
        tiedAnimationUrl: wishKnot.tiedAnimationUrl,
        canReveal,
        scheduledRevealDate: wishKnot.scheduledRevealDate,
        viewCount: wishKnot.viewCount,
        symbolism: wishKnot.visualMetadata?.symbolism || 'A knot tied with intention and care',
        isRevealed: wishKnot.isRevealed,
        // Don't send the actual message until untied
        previewMessage: 'This knot holds a special message tied with care. Click to untie and reveal the message.'
      }
    });

  } catch (error) {
    console.error('❌ Error viewing WishKnot:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to view WishKnot',
      error: error.message
    });
  }
});

// View WishKnot by Gift ID - public endpoint for email links
router.get('/gift/:giftId', async (req, res) => {
  try {
    const { giftId } = req.params;
    
    console.log('👀 Viewing WishKnot by gift ID:', giftId);

    // Find the WishKnot by giftId
    const wishKnot = await WishKnot.findOne({ giftId });
    
    if (!wishKnot) {
      return res.status(404).json({
        success: false,
        message: 'WishKnot not found'
      });
    }

    // Increment view count
    await wishKnot.incrementView();

    // Check if scheduled reveal
    const now = new Date();
    const canReveal = !wishKnot.scheduledRevealDate || now >= wishKnot.scheduledRevealDate;

    res.json({
      success: true,
      wishKnot: {
        knotId: wishKnot.knotId,
        accessToken: wishKnot.accessToken,
        recipientName: wishKnot.recipientName,
        senderName: wishKnot.senderName,
        state: wishKnot.state,
        knotType: wishKnot.knotType,
        tone: wishKnot.tone,
        occasion: wishKnot.occasion,
        tiedAnimationUrl: wishKnot.tiedAnimationUrl,
        canReveal,
        scheduledRevealDate: wishKnot.scheduledRevealDate,
        viewCount: wishKnot.viewCount,
        symbolism: wishKnot.visualMetadata?.symbolism || 'A knot tied with intention and care',
        isRevealed: wishKnot.isRevealed,
        // NEVER send the actual message until untied - only preview text
        previewMessage: 'This knot holds a special message tied with care. Click to untie and reveal the message.'
      }
    });

  } catch (error) {
    console.error('❌ Error viewing WishKnot by gift ID:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to view WishKnot',
      error: error.message
    });
  }
});

// Start untying animation and reveal message
router.post('/untie/:accessToken', async (req, res) => {
  try {
    const { accessToken } = req.params;
    
    console.log('🪢 Untying WishKnot with token:', accessToken.substring(0, 8) + '...');

    const wishKnot = await WishKnot.findByAccessToken(accessToken);
    
    if (!wishKnot) {
      return res.status(404).json({
        success: false,
        message: 'WishKnot not found'
      });
    }

    // Check if scheduled reveal
    const now = new Date();
    if (wishKnot.scheduledRevealDate && now < wishKnot.scheduledRevealDate) {
      return res.status(403).json({
        success: false,
        message: 'This WishKnot is scheduled to be revealed later',
        scheduledDate: wishKnot.scheduledRevealDate
      });
    }

    // Check if already untied
    if (wishKnot.state === 'untied') {
      return res.json({
        success: true,
        alreadyUntied: true,
        wishKnot: {
          knotId: wishKnot.knotId,
          state: wishKnot.state,
          personalizedMessage: wishKnot.personalizedMessage,
          senderMessage: wishKnot.senderMessage,
          untiedAt: wishKnot.untiedAt,
          untieAnimationUrl: wishKnot.untieAnimationUrl
        }
      });
    }

    // Start untying process
    await wishKnot.untie();

    console.log('✅ WishKnot untying started');

    res.json({
      success: true,
      wishKnot: {
        knotId: wishKnot.knotId,
        recipientName: wishKnot.recipientName,
        senderName: wishKnot.senderName,
        state: 'untying',
        personalizedMessage: wishKnot.personalizedMessage,
        senderMessage: wishKnot.senderMessage,
        knotType: wishKnot.knotType,
        untieAnimationUrl: wishKnot.untieAnimationUrl,
        symbolism: wishKnot.visualMetadata?.symbolism,
        untiedAt: null // Will be set after animation completes
      },
      message: 'WishKnot is being untied... The message will be revealed in 3 seconds'
    });

  } catch (error) {
    console.error('❌ Error untying WishKnot:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to untie WishKnot',
      error: error.message
    });
  }
});

// Get untied state and message (called after animation completes)
router.get('/untied/:accessToken', async (req, res) => {
  try {
    const { accessToken } = req.params;
    
    console.log('📖 Getting untied WishKnot message...');

    const wishKnot = await WishKnot.findByAccessToken(accessToken);
    
    if (!wishKnot) {
      return res.status(404).json({
        success: false,
        message: 'WishKnot not found'
      });
    }

    // Log interaction
    await wishKnot.logInteraction('message_viewed');

    res.json({
      success: true,
      wishKnot: {
        knotId: wishKnot.knotId,
        recipientName: wishKnot.recipientName,
        senderName: wishKnot.senderName,
        state: wishKnot.state,
        personalizedMessage: wishKnot.personalizedMessage,
        senderMessage: wishKnot.senderMessage,
        knotType: wishKnot.knotType,
        tone: wishKnot.tone,
        occasion: wishKnot.occasion,
        untiedAt: wishKnot.untiedAt,
        symbolism: wishKnot.visualMetadata?.symbolism,
        isRevealed: wishKnot.isRevealed
      }
    });

  } catch (error) {
    console.error('❌ Error getting untied WishKnot:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get untied WishKnot',
      error: error.message
    });
  }
});

// Re-tie a WishKnot (optional feature)
router.post('/retie/:accessToken', async (req, res) => {
  try {
    const { accessToken } = req.params;
    
    console.log('🔄 Re-tying WishKnot...');

    const wishKnot = await WishKnot.findByAccessToken(accessToken);
    
    if (!wishKnot) {
      return res.status(404).json({
        success: false,
        message: 'WishKnot not found'
      });
    }

    // Reset to tied state
    wishKnot.state = 'tied';
    wishKnot.isRevealed = false;
    wishKnot.untiedAt = null;
    
    await wishKnot.logInteraction('retied');
    await wishKnot.save();

    console.log('✅ WishKnot re-tied successfully');

    res.json({
      success: true,
      wishKnot: {
        knotId: wishKnot.knotId,
        state: wishKnot.state,
        tiedAnimationUrl: wishKnot.tiedAnimationUrl
      },
      message: 'WishKnot has been re-tied'
    });

  } catch (error) {
    console.error('❌ Error re-tying WishKnot:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to re-tie WishKnot',
      error: error.message
    });
  }
});

// Get WishKnot statistics
router.get('/stats/:knotId', async (req, res) => {
  try {
    const { knotId } = req.params;
    
    const stats = await WishKnot.getKnotStats(knotId);
    
    if (!stats || stats.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'WishKnot not found'
      });
    }

    res.json({
      success: true,
      stats: stats[0]
    });

  } catch (error) {
    console.error('❌ Error getting WishKnot stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get WishKnot stats',
      error: error.message
    });
  }
});

// Send WishKnot via email (after payment completion)
router.post('/send-email/:accessToken', async (req, res) => {
  try {
    const { accessToken } = req.params;
    const { recipientEmail } = req.body;

    console.log('📧 Sending WishKnot email...');

    const wishKnot = await WishKnot.findByAccessToken(accessToken);
    
    if (!wishKnot) {
      return res.status(404).json({
        success: false,
        message: 'WishKnot not found'
      });
    }

    const emailToSend = recipientEmail || wishKnot.recipientEmail;
    if (!emailToSend) {
      return res.status(400).json({
        success: false,
        message: 'No recipient email provided'
      });
    }

    // Send WishKnot email
    const emailResult = await nodemailerService.sendWishKnotEmail({
      recipientEmail: emailToSend,
      recipientName: wishKnot.recipientName,
      senderName: wishKnot.senderName,
      knotType: wishKnot.knotType,
      occasion: wishKnot.occasion,
      giftId: wishKnot.giftId,
      accessToken: wishKnot.accessToken,
      viewUrl: `${process.env.BASE_URL || 'http://localhost:5001'}/wishknot-view.html?giftId=${wishKnot.giftId}&token=${wishKnot.accessToken}`,
      scheduledRevealDate: wishKnot.scheduledRevealDate
    });

    if (emailResult.success) {
      await wishKnot.logInteraction('email_sent', { recipientEmail: emailToSend });
      
      res.json({
        success: true,
        message: 'WishKnot email sent successfully',
        messageId: emailResult.messageId
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send WishKnot email',
        error: emailResult.error
      });
    }

  } catch (error) {
    console.error('❌ Error sending WishKnot email:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to send WishKnot email',
      error: error.message
    });
  }
});

export default router;