import express from 'express';
import aiService from '../services/aiService.js';
import Gift from '../models/Gift.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import nodemailerService from '../services/nodemailerService.js';
import {authenticateToken} from '../middleware/auth.js';
import VoiceStyle from '../models/VoiceStyle.js';

const router = express.Router();

// Debug logging for /generate route
router.post('/generate', authenticateToken, async (req, res) => {
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
      voiceStyleId, // <-- accept from client
    } = req.body;

    // Generate content using AI service
    const generatedContent = await aiService.generateContent({
      giftType,
      recipientName,
      tone,
      memories: memories || [],
      relationship,
      occasion,
      voiceStyleId, // <-- pass along to service
    });

    console.log('Generated content:', generatedContent);

    const giftDoc = new Gift({
      giftType,
      recipientName,
      senderName: senderName || 'Someone special',
      tone,
      memories: memories || [],
      relationship: relationship || 'friend',
      occasion: occasion || 'special occasion',
      generatedContent: typeof generatedContent === 'object' ? generatedContent.text : generatedContent,
      audioContent: typeof generatedContent === 'object' && generatedContent.audio ? generatedContent.audio : null,
      senderMessage: senderMessage || '',
      deliveryMethod: deliveryMethod || '',
      deliveryEmail: deliveryEmail || '',
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      price: getPrice(giftType),
      voiceStyleId: voiceStyleId || null, // <-- store selected voice style if provided
    });

    await giftDoc.save();
    console.log('Gift saved with audioContent:', !!giftDoc.audioContent);

    // Create payment and order (FIXED: Use real user ID from authentication)
    const userId = req.user.id; // Real user ID from authentication middleware
    
    const payment = new Payment({
      amount: giftDoc.price,
      userId: userId, // Using real user ID instead of dummy
      method: 'stripe',
      status: 'pending',
      buyerEmail: req.user.email, // Add required buyerEmail
      buyerName: req.user.name || senderName || 'Unknown', // Add required buyerName
    });
    
    await payment.save();
    
    const order = new Order({
      userId: userId, // Using real user ID instead of dummy
      giftId: giftDoc._id,
      type: giftType,
      payment: payment._id,
      paymentStatus: 'pending',
      price: giftDoc.price
    });
    
    await order.save();

    // Send order confirmation email to BUYER (logged-in user)
    try {
      // FIXED: Use authenticated user's email properly
      const buyerEmailAddress = req.user.email; // Get buyer email from authenticated user
      console.log('Sending confirmation email to buyer:', buyerEmailAddress);
      
      const emailResult = await nodemailerService.sendOrderConfirmation(buyerEmailAddress, {
        orderId: order._id.toString().slice(-6),
        giftType: giftType,
        recipientName: recipientName,
        recipientEmail: deliveryEmail,
        price: giftDoc.price,
        generatedContent: typeof generatedContent === 'object' ? generatedContent.text : generatedContent,
        buyerName: req.user.name || 'Friend' // Add buyer name if available
      });
      
      if (emailResult.success) {
        console.log('Order confirmation email sent to buyer successfully:', emailResult.messageId);
      } else {
        console.error('Failed to send order confirmation email to buyer:', emailResult.error);
      }
    } catch (emailError) {
      console.error('Error sending order confirmation to buyer:', emailError);
    }

    // DON'T send gift delivery email here - only after payment is completed
    // Gift email will be sent via payment webhook after successful payment
    console.log('Gift created successfully. Gift email will be sent after payment completion.');
    
    res.json({ giftId: giftDoc._id, generatedContent, orderId: order._id });
  } catch (error) {
    console.error('Error in /api/gift/generate:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// Public: Get active voice styles (no voiceId exposure)
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

// Remove this duplicate getPrice function (lines 535-543)
// function getPrice(giftType) {
//   switch (giftType) {
//     case 'voice': return 12;
//     case 'song': return 25;
//     case 'image': return 15;
//     case 'poem': return 8;
//     default: return 8;
//   }
// }

// After saving order and payment:
// await nodemailerService.sendOrderConfirmation(buyerEmail, {
//   orderId: order._id.toString().slice(-6),
//   giftType,
//   recipientName,
//   recipientEmail: deliveryEmail,
//   price: giftDoc.price,
//   generatedContent
// });

// if (payment.status === 'paid' && deliveryEmail) {
//   await nodemailerService.sendGiftEmail(deliveryEmail, {
//     giftType,
//     recipientName,
//     senderMessage,
//     generatedContent,
//     scheduledDate
//   });
// }

// In /generate route, after saving order:
// Remove or comment out the immediate gift sending
// if (deliveryMethod === 'email' && deliveryEmail) {
//   try {
//     const giftResult = await nodemailerService.sendGiftEmail(deliveryEmail, {
//       giftType: giftType,
//       recipientName: recipientName,
//       senderMessage: senderMessage,
//       generatedContent: generatedContent,
//       scheduledDate: scheduledDate
//     });
//     
//     if (giftResult.success) {
//       console.log('Gift email sent to recipient successfully:', giftResult.messageId);
//     } else {
//       console.error('Failed to send gift email to recipient:', giftResult.error);
//     }
//   } catch (giftError) {
//     console.error('Error sending gift email to recipient:', giftError);
//   }
// }

// New route for updating payment status
// router.post('/update-payment/:orderId', async (req, res) => {
//   const { status } = req.body;
//   try {
//     const order = await Order.findById(req.params.orderId);
//     if (!order) {
//       return res.status(404).json({ message: 'Order not found' });
//     }

//     const payment = await Payment.findById(order.payment);
//     if (!payment) {
//       return res.status(404).json({ message: 'Payment not found' });
//     }

//     payment.status = status;
//     await payment.save();

//     order.paymentStatus = status;
//     await order.save();

//     const gift = await Gift.findById(order.giftId);
//     if (!gift) {
//       return res.status(404).json({ message: 'Gift not found' });
//     }

//     gift.paymentStatus = status;
//     await gift.save();

//     if (status === 'completed' && gift.deliveryMethod === 'email' && gift.deliveryEmail) {
//       try {
//         const giftResult = await nodemailerService.sendGiftEmail(gift.deliveryEmail, {
//           giftType: gift.giftType,
//           recipientName: gift.recipientName,
//           senderMessage: gift.senderMessage,
//           generatedContent: gift.generatedContent,
//           scheduledDate: gift.scheduledDate
//         });
        
//         if (giftResult.success) {
//           console.log('Gift email sent to recipient after payment:', giftResult.messageId);
//         } else {
//           console.error('Failed to send gift email after payment:', giftResult.error);
//         }
//       } catch (giftError) {
//         console.error('Error sending gift email after payment:', giftError);
//       }
//     }

//     res.json({ message: 'Payment status updated', order });
//   } catch (error) {
//     console.error('Error updating payment:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// Payment update route - this will send gift email after successful payment
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

    // ONLY send gift email after successful payment
    if (status === 'completed' && gift.deliveryMethod === 'email' && gift.deliveryEmail) {
      try {
        const giftResult = await nodemailerService.sendGiftEmail({
          giftType: gift.giftType,
          recipientName: gift.recipientName,
          senderMessage: gift.senderMessage,
          generatedContent: gift.generatedContent,
          scheduledDate: gift.scheduledDate,
          deliveryEmail: gift.deliveryEmail,
          occasion: gift.occasion,
        });
        
        if (giftResult.success) {
          console.log('Gift email sent to recipient after payment:', giftResult.messageId);
        } else {
          console.error('Failed to send gift email after payment:', giftResult.error);
        }
      } catch (giftError) {
        console.error('Error sending gift email after payment:', giftError);
      }
    }

    res.json({ message: 'Payment status updated', order });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
router.post('/create', async (req, res) => {
  try {
    const newGift = await Gift.create(req.body);
    // Create associated payment
    const payment = await Payment.create({
      amount: newGift.price,
      status: 'pending'
    });

    // Create associated order
    const order = await Order.create({
      giftId: newGift._id,
      paymentStatus: 'pending',
      payment: payment._id

    });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'Server error' });
  }

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
    
    // Update the route:
    router.post('/generate', optionalAuth, async (req, res) => {
      try {
        // Generate content using AI service
        const generatedContent = await aiService.generateContent({
          giftType,
          recipientName,
          tone,
          memories: memories || [],
          relationship,
          occasion,
          voiceStyleId, // <-- pass along to service
        });
    
        console.log('Generated content:', generatedContent);
    
        const giftDoc = new Gift({
          giftType,
          recipientName,
          senderName: senderName || 'Someone special',
          tone,
          memories: memories || [],
          relationship: relationship || 'friend',
          occasion: occasion || 'special occasion',
          generatedContent: typeof generatedContent === 'object' ? generatedContent.text : generatedContent,
          audioContent: typeof generatedContent === 'object' && generatedContent.audio ? generatedContent.audio : null,
          senderMessage: senderMessage || '',
          deliveryMethod: deliveryMethod || '',
          deliveryEmail: deliveryEmail || '',
          scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
          price: getPrice(giftType),
          voiceStyleId: voiceStyleId || null, // <-- store selected voice style if provided
        });
    
        await giftDoc.save();
        console.log('Gift saved with audioContent:', !!giftDoc.audioContent);
    
        // Create payment and order (FIXED: Use real user ID from authentication)
        const userId = req.user.id; // Real user ID from authentication middleware
        
        const payment = new Payment({
          amount: giftDoc.price,
          userId: userId, // Using real user ID instead of dummy
          method: 'stripe',
          status: 'pending',
          buyerEmail: req.user.email, // Add required buyerEmail
          buyerName: req.user.name || senderName || 'Unknown', // Add required buyerName
        });
        
        await payment.save();
        
        const order = new Order({
          userId: userId, // Using real user ID instead of dummy
          giftId: giftDoc._id,
          type: giftType,
          payment: payment._id,
          paymentStatus: 'pending',
          price: giftDoc.price
        });
        
        await order.save();
    
        // Send order confirmation email to BUYER (logged-in user)
        try {
          // FIXED: Use authenticated user's email properly
          const buyerEmailAddress = req.user.email; // Get buyer email from authenticated user
          console.log('Sending confirmation email to buyer:', buyerEmailAddress);
          
          const emailResult = await nodemailerService.sendOrderConfirmation(buyerEmailAddress, {
            orderId: order._id.toString().slice(-6),
            giftType: giftType,
            recipientName: recipientName,
            recipientEmail: deliveryEmail,
            price: giftDoc.price,
            generatedContent: typeof generatedContent === 'object' ? generatedContent.text : generatedContent,
            buyerName: req.user.name || 'Friend' // Add buyer name if available
          });
          
          if (emailResult.success) {
            console.log('Order confirmation email sent to buyer successfully:', emailResult.messageId);
          } else {
            console.error('Failed to send order confirmation email to buyer:', emailResult.error);
          }
        } catch (emailError) {
          console.error('Error sending order confirmation to buyer:', emailError);
        }
    
        // DON'T send gift delivery email here - only after payment is completed
        // Gift email will be sent via payment webhook after successful payment
        console.log('Gift created successfully. Gift email will be sent after payment completion.');
        
        res.json({ giftId: giftDoc._id, generatedContent, orderId: order._id });
      } catch (error) {
        console.error('Error in /api/gift/generate:', error.message);
        res.status(500).json({ message: error.message });
      }
    });
    
    // Use authenticated user if available, otherwise use guest
    const userId = req.user?.id || 'guest';
    const userEmail = req.user?.email || req.body.buyerEmail || 'guest@example.com';
    const userName = req.user?.name || req.body.senderName || 'Guest';
    
    // Send order confirmation email to BUYER (logged-in user)
    try {
      // FIXED: Use authenticated user's email properly
      const buyerEmailAddress = req.user.email; // Get buyer email from authenticated user
      console.log('Sending confirmation email to buyer:', buyerEmailAddress);
      
      const emailResult = await nodemailerService.sendOrderConfirmation(buyerEmailAddress, {
        orderId: order._id.toString().slice(-6),
        giftType: giftType,
        recipientName: recipientName,
        recipientEmail: deliveryEmail,
        price: giftDoc.price,
        generatedContent: typeof generatedContent === 'object' ? generatedContent.text : generatedContent,
        buyerName: req.user.name || 'Friend' // Add buyer name if available
      });
      
      if (emailResult.success) {
        console.log('Order confirmation email sent to buyer successfully:', emailResult.messageId);
      } else {
        console.error('Failed to send order confirmation email to buyer:', emailResult.error);
      }
    
    //  catch (emailError) {
    //   console.error('Error sending order confirmation to buyer:', emailError);
    // }


    // DON'T send gift delivery email here - only after payment is completed
    // Gift email will be sent via payment webhook after successful payment
    console.log('Gift created successfully. Gift email will be sent after payment completion.');
    
    res.json({ giftId: giftDoc._id, generatedContent, orderId: order._id });
  
    // DON'T send gift delivery email here - only after payment is completed
    // Gift email will be sent via payment webhook after successful payment
    console.log('Gift created successfully. Gift email will be sent after payment completion.');
    
    res.json({ giftId: giftDoc._id, generatedContent, orderId: order._id });
  } catch (error) {
    console.error('Error in /api/gift/generate:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// Public: Get active voice styles (no voiceId exposure)
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

function getPrice(giftType) {
  switch (giftType) {
    case 'voice': return 12;
    case 'song': return 25;
    case 'image': return 15;  // ✅ Image gifts کے لیے صحیح قیمت
    case 'poem': return 8;
    default: return 8;
  }
}

// After saving order and payment:
// await nodemailerService.sendOrderConfirmation(buyerEmail, {
//   orderId: order._id.toString().slice(-6),
//   giftType,
//   recipientName,
//   recipientEmail: deliveryEmail,
//   price: giftDoc.price,
//   generatedContent
// });

// if (payment.status === 'paid' && deliveryEmail) {
//   await nodemailerService.sendGiftEmail(deliveryEmail, {
//     giftType,
//     recipientName,
//     senderMessage,
//     generatedContent,
//     scheduledDate
//   });
// }

// In /generate route, after saving order:
// Remove or comment out the immediate gift sending
// if (deliveryMethod === 'email' && deliveryEmail) {
//   try {
//     const giftResult = await nodemailerService.sendGiftEmail(deliveryEmail, {
//       giftType: giftType,
//       recipientName: recipientName,
//       senderMessage: senderMessage,
//       generatedContent: generatedContent,
//       scheduledDate: scheduledDate
//     });
//     
//     if (giftResult.success) {
//       console.log('Gift email sent to recipient successfully:', giftResult.messageId);
//     } else {
//       console.error('Failed to send gift email to recipient:', giftResult.error);
//     }
//   } catch (giftError) {
//     console.error('Error sending gift email to recipient:', giftError);
//   }
// }

// New route for updating payment status
// router.post('/update-payment/:orderId', async (req, res) => {
//   const { status } = req.body;
//   try {
//     const order = await Order.findById(req.params.orderId);
//     if (!order) {
//       return res.status(404).json({ message: 'Order not found' });
//     }

//     const payment = await Payment.findById(order.payment);
//     if (!payment) {
//       return res.status(404).json({ message: 'Payment not found' });
//     }

//     payment.status = status;
//     await payment.save();

//     order.paymentStatus = status;
//     await order.save();

//     const gift = await Gift.findById(order.giftId);
//     if (!gift) {
//       return res.status(404).json({ message: 'Gift not found' });
//     }

//     gift.paymentStatus = status;
//     await gift.save();

//     if (status === 'completed' && gift.deliveryMethod === 'email' && gift.deliveryEmail) {
//       try {
//         const giftResult = await nodemailerService.sendGiftEmail(gift.deliveryEmail, {
//           giftType: gift.giftType,
//           recipientName: gift.recipientName,
//           senderMessage: gift.senderMessage,
//           generatedContent: gift.generatedContent,
//           scheduledDate: gift.scheduledDate
//         });
        
//         if (giftResult.success) {
//           console.log('Gift email sent to recipient after payment:', giftResult.messageId);
//         } else {
//           console.error('Failed to send gift email after payment:', giftResult.error);
//         }
//       } catch (giftError) {
//         console.error('Error sending gift email after payment:', giftError);
//       }
//     }

//     res.json({ message: 'Payment status updated', order });
//   } catch (error) {
//     console.error('Error updating payment:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// Payment update route - this will send gift email after successful payment
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

    // ONLY send gift email after successful payment
    if (status === 'completed' && gift.deliveryMethod === 'email' && gift.deliveryEmail) {
      try {
        const giftResult = await nodemailerService.sendGiftEmail({
          giftType: gift.giftType,
          recipientName: gift.recipientName,
          senderMessage: gift.senderMessage,
          generatedContent: gift.generatedContent,
          scheduledDate: gift.scheduledDate,
          deliveryEmail: gift.deliveryEmail,
          occasion: gift.occasion,
        });
        
        if (giftResult.success) {
          console.log('Gift email sent to recipient after payment:', giftResult.messageId);
        } else {
          console.error('Failed to send gift email after payment:', giftResult.error);
        }
      } catch (giftError) {
        console.error('Error sending gift email after payment:', giftError);
      }
    }

    res.json({ message: 'Payment status updated', order });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;