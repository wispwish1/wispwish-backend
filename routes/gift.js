import express from 'express';
import axios from 'axios';
import aiService from '../services/aiService.js';
import Gift from '../models/Gift.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Subscription from '../models/Subscription.js';
import nodemailerService from '../services/nodemailerService.js';
import jwt from 'jsonwebtoken'; // Added for optionalAuth middleware
import User from '../models/User.js'; // Added for optionalAuth middleware
import VoiceStyle from '../models/VoiceStyle.js';
import WishKnot from '../models/WishKnot.js'; // Add WishKnot model
import { canCreateGift, checkSubscriptionLimit, incrementGiftCount } from '../middleware/subscriptionLimit.js';
import { isPlanActive, resolvePlanDates } from '../utils/subscriptionUtils.js';
 
const router = express.Router();

const getSafeErrorLog = (error) => ({
  message: error.message,
  statusCode: error.statusCode || error.response?.status || 500,
  provider: error.provider || null,
  externalCode: error.externalCode || error.response?.data?.error?.code || error.response?.data?.error?.type || null,
  safeDetails: error.safeDetails || null
});

const deliverGiftForSubscription = async (gift, buyerEmail) => {
  try {
    if (!gift || gift.deliveryMethod !== 'email' || !gift.deliveryEmail) {
      return;
    }
    const now = new Date();
    const scheduledDate = gift.scheduledDate ? new Date(gift.scheduledDate) : now;
    if (scheduledDate > now) {
      gift.deliveryStatus = 'scheduled';
      await gift.save();
      console.log(`dY"2 Subscription gift scheduled for ${scheduledDate.toISOString()}`);
      return;
    }

    const freshGift = await Gift.findById(gift._id);
    if (!freshGift) {
      console.warn('�s��,? Unable to reload subscription gift for delivery', gift?._id);
      return;
    }

    if (freshGift.giftType === 'wishknot') {
      const wishKnot = await WishKnot.findOne({ giftId: freshGift._id });
      if (!wishKnot) {
        console.error('�?O WishKnot record missing for subscription gift:', freshGift._id);
        freshGift.deliveryStatus = 'failed';
        await freshGift.save();
        return;
      }

      const emailResult = await nodemailerService.sendWishKnotEmail({
        recipientEmail: freshGift.deliveryEmail,
        recipientName: freshGift.recipientName,
        senderName: freshGift.senderName,
        knotType: wishKnot.knotType,
        occasion: freshGift.occasion,
        giftId: freshGift._id,
        accessToken: wishKnot.accessToken,
        viewUrl: `${process.env.BASE_URL || 'http://127.0.0.1:5500'}/wishknot-view.html?giftId=${freshGift._id}&token=${wishKnot.accessToken}`,
        scheduledRevealDate: wishKnot.scheduledRevealDate
      });

      if (emailResult.success) {
        await wishKnot.logInteraction('email_sent', { recipientEmail: freshGift.deliveryEmail });
        freshGift.deliveryStatus = 'delivered';
        freshGift.deliveredAt = new Date();
        await freshGift.save();
        console.log(`�o. Subscription WishKnot delivered: ${freshGift._id}`);
      } else {
        freshGift.deliveryStatus = 'failed';
        await freshGift.save();
        console.error('�?O Failed to email subscription WishKnot:', emailResult.error);
      }
      return;
    }

    try {
      const emailPayload = {
        ...freshGift.toObject(),
        buyerEmail: buyerEmail || freshGift.deliveryEmail
      };
      const giftResult = await nodemailerService.sendGiftEmail(emailPayload);

      if (giftResult.success) {
        freshGift.deliveryStatus = 'delivered';
        freshGift.deliveredAt = new Date();
        await freshGift.save();
        console.log(`�o. Subscription gift delivered immediately: ${freshGift._id}`);
      } else {
        freshGift.deliveryStatus = 'failed';
        await freshGift.save();
        console.error(`�?O Failed to send subscription gift email: ${freshGift._id}`, giftResult.error);
      }
    } catch (emailError) {
      freshGift.deliveryStatus = 'failed';
      await freshGift.save();
      console.error('�?O Error sending subscription gift email:', emailError.message);
    }
  } catch (error) {
    console.error('�?O Subscription gift delivery error:', error);
  }
};

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
router.post('/generate', optionalAuth, checkSubscriptionLimit, async (req, res) => {
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
      personalityTraits,
      handwritingStyle,
      voiceStyle,
      length,
      poemLength,
      deliveryMethod,
      deliveryEmail,
      scheduledDate,
      senderName,
      buyerEmail,
      voiceStyleId,
      scheduledTimezone,
      scheduledOffsetMinutes,
      language, // Add language parameter
      regenerateOptions = [],
      isRegenerate = false
    } = req.body;
    console.log('Regenerate flags:', { isRegenerate, regenerateOptions });


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
          occasion,
          language, // Pass language parameter
          senderMessage,
          personalityTraits,
          handwritingStyle,
          voiceStyle,
          length,
          poemLength,
          includePremiumBundle: false,
          regenerateOptions,
          isRegenerate
        }),
        aiService.generateContent({
          giftType: 'voice',
          recipientName,
          tone,
          memories: memories || [],
          relationship,
          occasion,
          language, // Pass language parameter
          senderMessage,
          personalityTraits,
          handwritingStyle,
          voiceStyle,
          regenerateOptions,
          isRegenerate
        }),
        aiService.generateContent({
          giftType: 'illustration',
          recipientName,
          tone,
          memories: memories || [],
          relationship,
          occasion,
          language, // Pass language parameter
          senderMessage,
          personalityTraits,
          handwritingStyle,
          voiceStyle,
          regenerateOptions,
          isRegenerate
        }),
        aiService.generateContent({
          giftType: 'video',
          recipientName,
          tone,
          memories: memories || [],
          relationship,
          occasion,
          language, // Pass language parameter
          senderMessage,
          personalityTraits,
          handwritingStyle,
          voiceStyle,
          regenerateOptions,
          isRegenerate
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
        language, // Pass language parameter
        senderMessage,
        personalityTraits,
        handwritingStyle,
        voiceStyle,
        length,
        poemLength,
        regenerateOptions,
        isRegenerate,
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

    // Get user info before creating gift
    const userId = req.user?.id || req.user?._id || null;
    const userEmail = req.user?.email || buyerEmail || 'guest@example.com';
    const userName = req.user?.name || senderName || 'Guest';

    // Find active subscription for this user/email and link it to the gift
    let activeSubscription = null;
    if (userEmail && userEmail !== 'guest@example.com') {
      try {
        const subscriptionQuery = {
          $or: [{ customerEmail: userEmail.toLowerCase() }]
        };

        if (userId) {
          subscriptionQuery.$or.push({ userId: userId });
        }

        activeSubscription = await Subscription.findOne(subscriptionQuery).sort({ createdAt: -1 });

        if (activeSubscription && !isPlanActive(activeSubscription)) {
          activeSubscription = null;
        }

        if (activeSubscription) {
          console.log(`? Found active subscription ${activeSubscription._id} (${activeSubscription.frequency} plan) for user`);
        }
      } catch (subError) {
        console.error('Error finding subscription for gift:', subError);
        // Continue without subscription link if there's an error
      }
    }

    const subscriptionFromLimitCheck = req.subscription && isPlanActive(req.subscription) ? req.subscription : null;
    const linkedSubscription = subscriptionFromLimitCheck || activeSubscription;

    let subscriptionUsageInfo = null;
    let subscriptionCoversGift = false;
    if (linkedSubscription && userEmail && userEmail !== 'guest@example.com') {
      try {
        subscriptionUsageInfo = await canCreateGift(userEmail, userId);
        subscriptionCoversGift =
          Boolean(subscriptionUsageInfo?.planStatus === 'active') &&
          subscriptionUsageInfo.subscriptionType === linkedSubscription.frequency &&
          subscriptionUsageInfo.canCreate;
      } catch (usageError) {
        console.error('Error evaluating subscription usage:', usageError);
      }
    }

    const effectivePrice = subscriptionCoversGift ? 0 : getPrice(giftType);
    const linkedPlanDates = linkedSubscription ? resolvePlanDates(linkedSubscription) : null;
    const normalizedPersonalityTraits = Array.isArray(personalityTraits)
      ? personalityTraits.map(trait => String(trait || '').trim()).filter(Boolean)
      : String(personalityTraits || '').split(/[\n,]+/).map(trait => trait.trim()).filter(Boolean);

    const giftDoc = new Gift({
      giftType,
      recipientName,
      senderName: senderName || 'Someone special',
      tone,
      memories: memories || [],
      personalityTraits: normalizedPersonalityTraits,
      relationship: relationship || 'friend',
      occasion: occasion || 'special occasion',
      generatedContent: typeof formattedContent === 'object' ? formattedContent : { text: formattedContent },
      audioContent: formattedContent?.components?.voice?.audioUrl || formattedContent?.voiceMessage?.audioUrl || formattedContent?.audioUrl || null,
      videoContent: formattedContent?.components?.video?.videoUrl || formattedContent?.videoUrl || null, // Add video content
      senderMessage: senderMessage || '',
      handwritingStyle: handwritingStyle || '',
      voiceStyleName: voiceStyle || '',
      poemLength: length || poemLength || '',
      deliveryMethod: deliveryMethod || '',
      deliveryEmail: deliveryEmail || '',
      buyerEmail: userEmail,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      price: effectivePrice,
      scheduledTimezone: scheduledTimezone || req.body.timezone || '',
      scheduledOffsetMinutes: typeof scheduledOffsetMinutes === 'number' ? scheduledOffsetMinutes : (new Date().getTimezoneOffset() * -1),
      voiceStyleId: voiceStyleId || null,
      subscriptionId: linkedSubscription ? linkedSubscription._id : undefined,
      paymentStatus: subscriptionCoversGift ? 'completed' : undefined,
      status: subscriptionCoversGift ? 'completed' : undefined,
    });

    // If scheduled for future, mark as scheduled at creation time
    try {
      const now = new Date();
      if (giftDoc.scheduledDate && new Date(giftDoc.scheduledDate) > now) {
        giftDoc.deliveryStatus = 'scheduled';
        console.log(`?? Setting deliveryStatus=scheduled on creation for gift ${giftDoc._id} at ${new Date(giftDoc.scheduledDate).toISOString()}`);
      }
    } catch { }

    // Save gift with retry logic for database timeouts
    let saveAttempts = 0;
    const maxSaveAttempts = 5; // Increase retry attempts

    while (saveAttempts < maxSaveAttempts) {
      try {
        await giftDoc.save();
        console.log('Gift saved with audioContent:', !!giftDoc.audioContent);
        // Debug logging for subscription gift tracking
        console.log('\n========== GIFT SAVED (SUBSCRIPTION TRACKING) ==========');
        console.log('Gift ID:', giftDoc._id.toString());
        console.log('Buyer Email:', giftDoc.buyerEmail);
        console.log('Status:', giftDoc.status);
        console.log('Payment Status:', giftDoc.paymentStatus);
        console.log('Subscription ID:', giftDoc.subscriptionId?.toString() || 'none');
        console.log('Subscription Covers Gift:', subscriptionCoversGift);
        console.log('Created At:', giftDoc.createdAt);
        console.log('=========================================================\n');

        // INCREMENT GIFT COUNT after successful save
        if (subscriptionCoversGift && linkedSubscription) {
          await incrementGiftCount(linkedSubscription);
          console.log('✅ Gift quota incremented for subscription:', linkedSubscription._id);
        }

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
          language, // Store language parameter
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

    // Log subscription link if it was set
    if (linkedSubscription && giftDoc.subscriptionId) {
      console.log(`? Gift ${giftDoc._id} linked to subscription ${linkedSubscription._id} (${linkedSubscription.frequency} plan)`);
    }

    let payment, order;

    // Save payment with retry logic
    let paymentSaveAttempts = 0;

    while (paymentSaveAttempts < maxSaveAttempts) {
      try {
        const paymentStatus = subscriptionCoversGift ? 'completed' : 'pending';
        const paymentMethod = subscriptionCoversGift ? 'subscription' : 'stripe';
        payment = new Payment({
          amount: effectivePrice,
          currency: 'aud',
          userId,
          subscriptionId: linkedSubscription ? linkedSubscription._id : undefined,
          method: paymentMethod,
          status: paymentStatus,
          buyerEmail: userEmail,
          buyerName: userName,
          completedAt: subscriptionCoversGift ? new Date() : undefined
        });

        await payment.save();
        break; // Success, exit the loop
      } catch (saveError) {
        paymentSaveAttempts++;
        console.error(`❌ Payment save attempt ${paymentSaveAttempts} failed:`, saveError.message);

        if (paymentSaveAttempts >= maxSaveAttempts) {
          throw new Error(`Failed to save payment after ${maxSaveAttempts} attempts: ${saveError.message}`);
        }

        // Wait before retrying with longer delays
        await new Promise(resolve => setTimeout(resolve, 2000 * paymentSaveAttempts));
      }
    }

    // Save order with retry logic
    let orderSaveAttempts = 0;
    while (orderSaveAttempts < maxSaveAttempts) {
      try {
        const orderStatus = subscriptionCoversGift ? 'completed' : 'pending';
        order = new Order({
          userId,
          giftId: giftDoc._id,
          subscriptionId: linkedSubscription ? linkedSubscription._id : undefined,
          type: giftType,
          payment: payment._id,
          paymentStatus: subscriptionCoversGift ? 'completed' : 'pending',
          status: orderStatus,
          completedAt: subscriptionCoversGift ? new Date() : undefined,
          price: effectivePrice
        });

        await order.save();
        payment.order = order._id;
        await payment.save();
        break; // Success, exit the loop
      } catch (saveError) {
        orderSaveAttempts++;
        console.error(`❌ Order save attempt ${orderSaveAttempts} failed:`, saveError.message);

        if (orderSaveAttempts >= maxSaveAttempts) {
          throw new Error(`Failed to save order after ${maxSaveAttempts} attempts: ${saveError.message}`);
        }

        // Wait before retrying with longer delays
        await new Promise(resolve => setTimeout(resolve, 2000 * orderSaveAttempts));
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
          price: effectivePrice,
          generatedContent: formattedContent,
          audioContent: formattedContent?.voiceMessage?.audioUrl || formattedContent?.audioUrl || formattedContent?.components?.voice?.audioUrl || null,
          buyerName: userName,
          giftId: giftDoc._id,
          isSubscriptionGift: subscriptionCoversGift,
          planName: linkedSubscription?.planName || null,
          planExpiresAt: linkedPlanDates?.expiresAt || linkedSubscription?.planExpiresAt || null
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

    if (subscriptionCoversGift) {
      console.log('Subscription benefit applied. Delivering without Stripe payment.');
      await deliverGiftForSubscription(giftDoc, userEmail);
    } else {
      console.log('Gift created successfully. Gift email will be sent after payment completion.');
    }

    // Return response with giftId, formattedContent, orderId, and WishKnot data
    const response = {
      giftId: giftDoc._id,
      generatedContent: formattedContent,
      orderId: order._id
    };
    if (linkedSubscription) {
      response.subscription = {
        id: linkedSubscription._id,
        planName: linkedSubscription.planName,
        planActivatedAt: linkedPlanDates?.activatedAt || linkedSubscription.planActivatedAt || null,
        planExpiresAt: linkedPlanDates?.expiresAt || linkedSubscription.planExpiresAt || null
      };
      response.subscriptionCovered = subscriptionCoversGift;
      if (subscriptionUsageInfo && subscriptionUsageInfo.limit != null) {
        const usedBefore = subscriptionUsageInfo.used || 0;
        const usedIncludingCurrent = subscriptionCoversGift ? usedBefore + 1 : usedBefore;
        response.subscriptionBenefit = {
          applied: subscriptionCoversGift,
          limit: subscriptionUsageInfo.limit,
          used: Math.min(subscriptionUsageInfo.limit, usedIncludingCurrent),
          remaining: Math.max(subscriptionUsageInfo.limit - usedIncludingCurrent, 0),
          resetDate: subscriptionUsageInfo.resetDate,
          subscriptionType: subscriptionUsageInfo.subscriptionType,
          planStatus: subscriptionUsageInfo.planStatus
        };
      }
    }

    // Add WishKnot specific data if applicable
    if (wishKnotData) {
      response.wishKnot = wishKnotData;
    }

    res.json(response);
  } catch (error) {
    console.error('Error in /api/gift/generate:', getSafeErrorLog(error));

    // Handle database timeout errors
    if (error.name === 'MongoNetworkTimeoutError' || error.message.includes('timed out') || error.message.includes('connection')) {
      return res.status(504).json({
        message: 'Database connection timed out. The gift was generated successfully but we had trouble saving it. Please try again.',
        error: 'database_timeout'
      });
    }

    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      message: 'Failed to generate gift. Please try again.',
      error: error.message,
      provider: error.provider,
      code: error.externalCode,
      details: process.env.NODE_ENV === 'development' ? error.safeDetails : undefined
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
                viewUrl: `${process.env.BASE_URL || 'https://www.wispwish.com'}/wishknot-view.html?giftId=${gift._id}&token=${wishKnot.accessToken}`,
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

// Check if user can create a gift based on their subscription
router.post('/can-create', optionalAuth, async (req, res) => {
  try {
    const { email } = req.body;
    const userId = req.user?.id || req.user?._id || null;

    // If user is authenticated, try to get email from user object first
    let userEmail = email;
    if (req.user && req.user.email) {
      userEmail = req.user.email;
      console.log('✅ Using email from authenticated user:', userEmail);
    }

    if (!userEmail) {
      return res.json({ canCreate: true });
    }

    // If user has a plan with activeSubscriptionId, use that to find subscription directly
    if (req.user && req.user.plan && req.user.plan.activeSubscriptionId) {
      try {
        const subscription = await Subscription.findById(req.user.plan.activeSubscriptionId);
        if (subscription && isPlanActive(subscription)) {
          console.log('✅ Found subscription from user plan:', subscription._id);
          // Use the subscription's customerEmail for the check
          const result = await canCreateGift(subscription.customerEmail || userEmail, userId);
          return res.json(result);
        }
      } catch (subError) {
        console.warn('Could not find subscription from user plan, falling back to email lookup:', subError.message);
      }
    }

    const result = await canCreateGift(userEmail, userId);
    console.log('📊 can-create result:', {
      planStatus: result.planStatus,
      subscriptionType: result.subscriptionType,
      canCreate: result.canCreate,
      email: userEmail,
      userId: userId
    });
    res.json(result);
  } catch (error) {
    console.error('Error checking gift creation permission:', error);
    res.json({ canCreate: true }); // Default to allowing creation if check fails
  }
});

// Send gift for subscriber without payment
// NOTE: No quota check here - quota is only validated at gift CREATION, not when SENDING
router.post('/send-for-subscriber', optionalAuth, async (req, res) => {
  try {
    const { giftId, recipientEmail, senderEmail, recipientName } = req.body;

    if (!giftId) {
      return res.status(400).json({
        success: false,
        message: 'Gift ID is required'
      });
    }

    // Find the gift
    const gift = await Gift.findById(giftId);
    if (!gift) {
      return res.status(404).json({
        success: false,
        message: 'Gift not found'
      });
    }

    // Check if gift is already delivered with subscription
    // This handles the case where gift was already processed in the generate route
    if (gift.paymentStatus === 'completed' && gift.subscriptionId &&
      (gift.deliveryStatus === 'delivered' || gift.deliveryStatus === 'scheduled' || gift.status === 'completed')) {
      console.log('✅ Gift already processed with subscription:', {
        giftId: gift._id,
        paymentStatus: gift.paymentStatus,
        deliveryStatus: gift.deliveryStatus,
        subscriptionId: gift.subscriptionId
      });
      return res.json({
        success: true,
        message: 'Gift already sent successfully with subscription',
        giftId: gift._id,
        deliveryStatus: gift.deliveryStatus,
        alreadyProcessed: true
      });
    }

    // Get user identity
    const userId = req.user?.id || req.user?._id || null;
    const buyerEmail = senderEmail || gift.customerEmail || gift.deliveryEmail;

    if (!buyerEmail) {
      return res.status(400).json({
        success: false,
        message: 'Buyer email is required'
      });
    }

    // Check if user has active subscription
    // Don't filter by status: 'active' in query - instead find any subscription and use isPlanActive() to validate
    const subscriptionQuery = {
      $or: [
        { customerEmail: buyerEmail.toLowerCase() }
      ]
    };

    if (userId) {
      subscriptionQuery.$or.push({ userId: userId });
    }

    // Find the most recent subscription for this user/email
    const subscription = await Subscription.findOne(subscriptionQuery).sort({ createdAt: -1 });

    // Use isPlanActive to properly check if subscription is valid based on dates
    if (!subscription || !isPlanActive(subscription)) {
      console.log('❌ No active subscription found:', {
        hasSubscription: !!subscription,
        status: subscription?.status,
        isPlanActiveResult: subscription ? isPlanActive(subscription) : false,
        buyerEmail,
        userId
      });
      return res.status(403).json({
        success: false,
        message: 'Active subscription required to send gift without payment'
      });
    }

    console.log('✅ Active subscription found:', {
      subscriptionId: subscription._id,
      planName: subscription.planName,
      frequency: subscription.frequency,
      status: subscription.status
    });

    // Quota check is now handled by checkSubscriptionLimit middleware
    // The middleware blocks the request before it reaches here if quota is exceeded

    // Check for existing order
    let order = await Order.findOne({ giftId });

    // Create order if it doesn't exist
    if (!order) {
      order = new Order({
        giftId,
        userId: userId || null,
        type: gift.giftType,
        paymentStatus: 'completed',
        price: 0, // Free for subscribers
        status: 'completed',
        completedAt: new Date(),
        subscriptionId: subscription._id
      });
      await order.save();
      console.log('✅ Order created for subscriber:', order._id);
    } else {
      // Update existing order
      order.paymentStatus = 'completed';
      order.status = 'completed';
      order.price = 0;
      order.completedAt = new Date();
      order.subscriptionId = subscription._id;
      await order.save();
      console.log('✅ Order updated for subscriber:', order._id);
    }

    // Check for existing payment
    let payment = order.payment ? await Payment.findById(order.payment) : null;

    // Create payment record if it doesn't exist
    if (!payment) {
      payment = new Payment({
        order: order._id,
        userId: userId || null,
        amount: 0, // Free for subscribers
        method: 'subscription',
        status: 'completed',
        completedAt: new Date(),
        buyerEmail: buyerEmail,
        subscriptionId: subscription._id
      });
      await payment.save();
      console.log('✅ Payment record created for subscriber:', payment._id);

      // Link payment to order
      order.payment = payment._id;
      await order.save();
    } else {
      // Update existing payment
      payment.status = 'completed';
      payment.amount = 0;
      payment.method = 'subscription';
      payment.completedAt = new Date();
      payment.subscriptionId = subscription._id;
      await payment.save();
      console.log('✅ Payment record updated for subscriber:', payment._id);
    }

    // Update gift status
    gift.paymentStatus = 'completed';
    gift.status = 'completed';
    gift.price = 0;
    gift.subscriptionId = subscription._id;
    gift.buyerEmail = buyerEmail;

    // Update delivery email if provided
    if (recipientEmail) {
      gift.deliveryEmail = recipientEmail;
    }
    if (recipientName) {
      gift.recipientName = recipientName;
    }

    await gift.save();
    console.log('✅ Gift updated for subscriber:', gift._id);

    // INCREMENT GIFT COUNT after successful gift update
    await incrementGiftCount(subscription);
    console.log('✅ Gift quota incremented for subscription:', subscription._id);

    // Process gift delivery (similar to payment completion)
    await deliverGiftForSubscription(gift, buyerEmail);

    // Reload gift to get updated status
    const updatedGift = await Gift.findById(giftId);

    res.json({
      success: true,
      message: 'Gift sent successfully for subscriber',
      giftId: gift._id,
      orderId: order._id,
      paymentId: payment._id,
      deliveryStatus: updatedGift.deliveryStatus
    });
  } catch (error) {
    console.error('❌ Error sending gift for subscriber:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending gift for subscriber',
      error: error.message
    });
  }
});

export default router;
