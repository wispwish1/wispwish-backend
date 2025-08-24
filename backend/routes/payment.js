import express from 'express';
import Stripe from 'stripe';
import Gift from '../models/Gift.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import nodemailerService from '../services/nodemailerService.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Available prices for validation
const VALID_PRICES = [8, 12, 15, 25];

// Valid payment statuses
const PAYMENT_STATUSES = {
  PENDING: 'pending',
  COMPLETE: 'completed',
  ERROR: 'error'
};

// Helper to get or create Stripe customer
async function getOrCreateCustomer(userId, email, name) {
  try {
    let stripeCustomerId;
    if (userId && userId !== 'guest') {
      const user = await User.findById(userId);
      if (!user) throw new Error('User not found');
      stripeCustomerId = user.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({ email, name });
        stripeCustomerId = customer.id;
        user.stripeCustomerId = stripeCustomerId;
        await user.save();
        console.log(`✅ Created Stripe customer: ${stripeCustomerId} for user: ${userId}`);
      }
    } else {
      const customer = await stripe.customers.create({ email, name });
      stripeCustomerId = customer.id;
      console.log(`✅ Created Stripe customer for guest: ${stripeCustomerId}`);
    }
    return stripeCustomerId;
  } catch (error) {
    console.error('Error creating Stripe customer:', error.message);
    throw error;
  }
}

// Create Stripe Checkout Session for One-Time Payment
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { giftId, price, giftType, recipientName, email, userId } = req.body;

    console.log('📝 Payment request received:', { giftId, price, giftType, recipientName, email, userId });

    if (!giftId || !price || !giftType || !recipientName || !email) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (!VALID_PRICES.includes(parseFloat(price))) {
      return res.status(400).json({ message: 'Invalid price' });
    }

    const gift = await Gift.findById(giftId);
    if (!gift) {
      return res.status(404).json({ message: 'Gift not found' });
    }

    // Check for existing order and payment
    let order = await Order.findOne({ giftId }).populate('payment');
    let payment;
    
    if (order && order.payment) {
      payment = order.payment;
      console.log('⚠️ Existing order and payment found:', { orderId: order._id, paymentId: payment._id });
      
      // Check if existing payment has valid Stripe session
      if (payment.stripeSessionId) {
        try {
          const stripeSession = await stripe.checkout.sessions.retrieve(payment.stripeSessionId);
          if (stripeSession.status === 'open') {
            return res.status(200).json({
              message: 'Existing payment session found',
              sessionId: payment.stripeSessionId,
              orderId: order._id,
              paymentId: payment._id,
              checkoutUrl: stripeSession.url,
              status: PAYMENT_STATUSES.PENDING
            });
          } else if (stripeSession.status === 'complete') {
            await updatePaymentStatus(payment.stripeSessionId, PAYMENT_STATUSES.COMPLETE);
            return res.status(200).json({
              message: 'Payment already completed',
              orderId: order._id,
              paymentId: payment._id,
              status: PAYMENT_STATUSES.COMPLETE
            });
          }
        } catch (stripeError) {
          console.log('🔄 Stripe session error, will create new session:', stripeError.message);
        }
      }
    }

    // Create new order if none exists
    if (!order) {
      order = new Order({
        giftId,
        userId: userId || null,
        type: giftType,
        paymentStatus: PAYMENT_STATUSES.PENDING,
        price,
      });
      await order.save();
      console.log('✅ New order created:', order._id);
    }

    // Create new payment only if none exists or existing one is invalid
    if (!payment) {
      payment = new Payment({
        order: order._id,
        userId: userId || null,
        amount: price,
        method: 'stripe',
        status: PAYMENT_STATUSES.PENDING,
        stripeSessionId: null,
      });
      await payment.save();
      console.log('✅ New payment record created:', payment._id);
    } else {
      // Reset existing payment for new session
      payment.status = PAYMENT_STATUSES.PENDING;
      payment.stripeSessionId = null;
      payment.amount = price; // Update amount in case it changed
      await payment.save();
      console.log('✅ Existing payment record reset:', payment._id);
    }

    // Create Stripe checkout session
    const stripeCustomerId = await getOrCreateCustomer(userId, email, recipientName);
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      billing_address_collection: 'auto',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'aud',
            product_data: {
              name: `${giftType.charAt(0).toUpperCase() + giftType.slice(1)} Gift`,
            },
            unit_amount: Math.round(price * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `http://127.0.0.1:5500/Frontend/generator.html?session_id={CHECKOUT_SESSION_ID}&gift_id=${giftId}`,
      cancel_url: 'http://127.0.0.1:5500/Frontend/generator.html',
      metadata: { giftId, buyerEmail: email, userId: userId || 'guest', paymentId: payment._id.toString() },
    });

    console.log('✅ Stripe checkout session created:', session.id);

    // Update payment with session ID and link to order
    payment.stripeSessionId = session.id;
    payment.order = order._id;
    order.payment = payment._id;
    await Promise.all([payment.save(), order.save()]);
    console.log('✅ Order-Payment linked successfully');

    res.status(200).json({
      checkoutUrl: session.url,
      sessionId: session.id,
      orderId: order._id,
      paymentId: payment._id,
      status: PAYMENT_STATUSES.PENDING // ✅ Fixed: Should be PENDING, not COMPLETE
    });
  } catch (error) {
    console.error('Error creating checkout session:', error.message);
    res.status(500).json({ message: 'Error creating checkout session', error: error.message });
  }
});

// Stripe Webhook Handler
// router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
//   console.log('🔔 Webhook received from Stripe');

//   let event;
//   const sig = req.headers['stripe-signature'];
//   try {
//     if (process.env.STRIPE_SECRET_KEY) {
//       event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
//       console.log('✅ Webhook signature verified');
//     } else {
//       console.log('⚠️ No webhook secret, parsing without verification (TEST MODE)');
//       event = JSON.parse(req.body.toString());
//     }
//     console.log('📋 Webhook event type:', event.type);
//   } catch (err) {
//     console.error('❌ Webhook signature verification failed:', err.message);
//     return res.status(400).send('Webhook signature verification failed');
//   }

//   try {
//     switch (event.type) {
//       case 'checkout.session.completed': {
//         const session = event.data.object;
//         const { giftId, buyerEmail, userId, paymentId } = session.metadata;

//         console.log('🎯 Payment successful! Processing for gift:', giftId);
//         console.log('📋 Session metadata:', session.metadata);
//         console.log('💳 Payment ID from metadata:', paymentId);

//         const payment = await Payment.findById(paymentId);
//         if (!payment) {
//           console.error('❌ Payment not found for ID:', paymentId);
//           console.log('🔍 Available payments in DB:', await Payment.find({}).limit(5));
//           throw new Error('Payment not found');
//         }

//         console.log('✅ Payment found:', payment._id);
        
//         await processPaymentCompletion(giftId, session.id, buyerEmail, PAYMENT_STATUSES.COMPLETE);
        
//         // ❌ REMOVE THESE REDUNDANT LINES (222-237):
//         // const order = await Order.findById(payment.order);
//         // if (order) {
//         //   order.paymentStatus = PAYMENT_STATUSES.COMPLETE;
//         //   order.status = 'completed';
//         //   order.completedAt = new Date();
//         //   await order.save();
//         // }
//         //
//         // if (giftId) {
//         //   const gift = await Gift.findById(giftId);
//         //   if (gift) {
//         //     gift.paymentStatus = PAYMENT_STATUSES.COMPLETE;
//         //     gift.status = 'completed';
//         //     await gift.save();
//         //   }
//         // }
        
//         await nodemailerService.sendPaymentConfirmation({
//           buyerEmail,
//           giftType: (await Gift.findById(giftId))?.type || 'unknown',
//           amount: session.amount_total / 100,
//           transactionId: session.payment_intent,
//         });
//         console.log('✅ Payment confirmation email sent');

//         res.json({
//           received: true,
//           message: 'Payment completed successfully',
//           status: PAYMENT_STATUSES.COMPLETE,
//           giftId,
//           orderId: payment.order.toString(),
//           paymentId,
//           transactionId: session.payment_intent,
//           amount: session.amount_total / 100,
//         });
//         break;
//       }
//       case 'checkout.session.expired':
//       case 'checkout.session.async_payment_failed': {
//         const session = event.data.object;
//         const { paymentId } = session.metadata;

//         await updatePaymentStatus(session.id, PAYMENT_STATUSES.ERROR, `Checkout session ${event.type === 'checkout.session.expired' ? 'expired' : 'payment failed'}`);
//         res.json({
//           received: true,
//           message: `Payment failed: ${event.type}`,
//           status: PAYMENT_STATUSES.ERROR,
//         });
//         break;
//       }
//       default:
//         console.log(`ℹ️ Unhandled event type: ${event.type}`);
//         res.json({ received: true });
//     }
//   } catch (error) {
//     console.error('💥 Error processing webhook:', error.message);
//     res.status(500).json({
//       message: 'Error processing webhook',
//       status: PAYMENT_STATUSES.ERROR,
//       error: error.message,
//     });
//   }
// });

// Stripe Webhook Handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('🔔 Webhook received from Stripe');

  let event;
  const sig = req.headers['stripe-signature'];
  try {
    if (process.env.STRIPE_SECRET_KEY) {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      console.log('✅ Webhook signature verified');
    } else {
      console.log('⚠️ No webhook secret, parsing without verification (TEST MODE)');
      event = JSON.parse(req.body.toString());
    }
    console.log('📋 Webhook event type:', event.type);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send('Webhook signature verification failed');
  }

  try {
    switch (event.type) {
     case 'checkout.session.completed': {
  const session = event.data.object;
  const { giftId, buyerEmail, userId, paymentId } = session.metadata;

  console.log('🎯 Payment successful! Processing for gift:', giftId);
  console.log('📋 Session metadata:', session.metadata);
  console.log('💳 Payment ID from metadata:', paymentId);

  // Find the payment first
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    console.error('❌ Payment not found for ID:', paymentId);
    return res.status(404).json({ message: 'Payment not found' });
  }

  console.log('✅ Payment found:', payment._id);
  
  // Update payment status first
  payment.status = PAYMENT_STATUSES.COMPLETE;
  payment.completedAt = new Date();
  await payment.save();
  console.log('✅ Payment status updated to complete');

  // Now update the order
  const order = await Order.findById(payment.order);
  if (order) {
    order.paymentStatus = PAYMENT_STATUSES.COMPLETE;
    order.status = 'completed';
    order.completedAt = new Date();
    await order.save();
    console.log('✅ Order status updated to complete:', order._id);
  }

  // Now update the gift
  let gift;
  if (order && order.giftId) {
    gift = await Gift.findById(order.giftId);
    if (gift) {
      gift.paymentStatus = PAYMENT_STATUSES.COMPLETE;
      gift.status = 'completed';
      await gift.save();
      console.log('✅ Gift status updated to complete:', gift._id);
    }
  }
  
  // Send confirmation email
  await nodemailerService.sendPaymentConfirmation({
    buyerEmail,
    giftType: gift?.type || 'unknown',
    amount: session.amount_total / 100,
    transactionId: session.payment_intent,
  });
  console.log('✅ Payment confirmation email sent');

  // Send gift email to recipient if delivery method is email
  if (gift && gift.deliveryMethod === 'email' && gift.deliveryEmail) {
    try {
      const now = new Date();
      const scheduledDate = gift.scheduledDate ? new Date(gift.scheduledDate) : now;
      
      // Check if it's time to send the gift (current time is after scheduled time)
      if (scheduledDate <= now) {
        const giftResult = await nodemailerService.sendGiftEmail({
          ...gift.toObject(),
          buyerEmail: buyerEmail,
        });

        if (giftResult.success) {
          gift.deliveryStatus = 'delivered';
          gift.deliveredAt = new Date();
          await gift.save();
          console.log(`✅ Gift email sent to recipient: ${gift.deliveryEmail}`);
        } else {
          gift.deliveryStatus = 'failed';
          await gift.save();
          console.error(`❌ Failed to send gift email: ${giftResult.error}`);
        }
      } else {
        // It's not time to send yet, mark as scheduled
        gift.deliveryStatus = 'scheduled';
        await gift.save();
        console.log(`📅 Gift scheduled for delivery at: ${scheduledDate}`);
      }
    } catch (emailError) {
      console.error('❌ Error processing gift delivery:', emailError.message);
    }
  }

  res.json({
    received: true,
    message: 'Payment completed successfully',
    status: PAYMENT_STATUSES.COMPLETE,
    giftId,
    orderId: payment.order ? payment.order.toString() : null,
    paymentId,
    transactionId: session.payment_intent,
    amount: session.amount_total / 100,
  });
  break;
}
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object;
        const { paymentId } = session.metadata;

        // Update payment status to error
        const payment = await Payment.findById(paymentId);
        if (payment) {
          payment.status = PAYMENT_STATUSES.ERROR;
          payment.errorMessage = `Checkout session ${event.type === 'checkout.session.expired' ? 'expired' : 'payment failed'}`;
          await payment.save();
          
          // Update order status
          const order = await Order.findById(payment.order);
          if (order) {
            order.paymentStatus = PAYMENT_STATUSES.ERROR;
            order.status = 'failed';
            await order.save();
          }
          
          // Update gift status
          if (order && order.giftId) {
            const gift = await Gift.findById(order.giftId);
            if (gift) {
              gift.paymentStatus = PAYMENT_STATUSES.ERROR;
              gift.status = 'failed';
              await gift.save();
            }
          }
        }

        res.json({
          received: true,
          message: `Payment failed: ${event.type}`,
          status: PAYMENT_STATUSES.ERROR,
        });
        break;
      }
      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
        res.json({ received: true });
    }
  } catch (error) {
    console.error('💥 Error processing webhook:', error.message);
    console.error('💥 Error stack:', error.stack);
    res.status(500).json({
      message: 'Error processing webhook',
      status: PAYMENT_STATUSES.ERROR,
      error: error.message,
    });
  }
});

// Helper: Update Payment Status
// async function updatePaymentStatus(stripeSessionId, status, errorMessage = null) {
//   try {
//     console.log(`🔄 Updating payment status to: ${status} for session: ${stripeSessionId}`);
    
//     const payment = await Payment.findOne({ stripeSessionId });
//     if (!payment) {
//       console.error('❌ Payment not found for session:', stripeSessionId);
//       throw new Error('Payment not found');
//     }

//     // Update Payment
//     payment.status = status;
//     if (status === PAYMENT_STATUSES.COMPLETE) payment.completedAt = new Date();
//     if (status === PAYMENT_STATUSES.ERROR) payment.errorMessage = errorMessage;
//     await payment.save();
//     console.log(`✅ Payment status updated to ${status}:`, payment._id);

//     // Update Order
//     const order = await Order.findById(payment.order);
//     if (order) {
//       order.paymentStatus = status;
//       if (status === PAYMENT_STATUSES.COMPLETE) {
//         order.status = 'completed';
//         order.completedAt = new Date();
//       } else if (status === PAYMENT_STATUSES.ERROR) {
//         order.status = 'failed';
//       }
//       order.payment = payment._id;
//       await order.save();
//       console.log(`✅ Order status updated to ${status}:`, order._id);

//       // Update Gift
//       if (order.giftId) {
//         const gift = await Gift.findById(order.giftId);
//         if (gift) {
//           gift.paymentStatus = status;
//           if (status === PAYMENT_STATUSES.COMPLETE) {
//         gift.status = 'completed';
//       } else if (status === PAYMENT_STATUSES.ERROR) {
//         gift.status = 'failed';
//       }
//           await gift.save();
//           console.log(`✅ Gift status updated to ${status}:`, gift._id);
//         }
//       }
//     }
    
//     console.log(`🎉 All tables updated successfully for payment: ${payment._id}`);
//   } catch (error) {
//     console.error('💥 Error updating payment status:', error.message);
//     throw error;
//   }
// }


// Helper: Update Payment Status
// async function updatePaymentStatus(stripeSessionId, status, errorMessage = null) {
//   try {
//     console.log(`🔄 Updating payment status to: ${status} for session: ${stripeSessionId}`);
    
//     const payment = await Payment.findOne({ stripeSessionId });
//     if (!payment) {
//       console.error('❌ Payment not found for session:', stripeSessionId);
//       throw new Error('Payment not found');
//     }

//     // Update Payment
//     payment.status = status;
//     if (status === PAYMENT_STATUSES.COMPLETE) payment.completedAt = new Date();
//     if (status === PAYMENT_STATUSES.ERROR) payment.errorMessage = errorMessage;
//     await payment.save();
//     console.log(`✅ Payment status updated to ${status}:`, payment._id);

//     // Update Order
//     const order = await Order.findById(payment.order);
//     if (order) {
//       order.paymentStatus = status;
//       if (status === PAYMENT_STATUSES.COMPLETE) {
//         order.status = 'completed';
//         order.completedAt = new Date();
//       } else if (status === PAYMENT_STATUSES.ERROR) {
//         order.status = 'failed';
//       }
//       await order.save();
//       console.log(`✅ Order status updated to ${status}:`, order._id);

//       // Update Gift
//       if (order.giftId) {
//         const gift = await Gift.findById(order.giftId);
//         if (gift) {
//           gift.paymentStatus = status;
//           if (status === PAYMENT_STATUSES.COMPLETE) {
//             gift.status = 'completed';
//           } else if (status === PAYMENT_STATUSES.ERROR) {
//             gift.status = 'failed';
//           }
//           await gift.save();
//           console.log(`✅ Gift status updated to ${status}:`, gift._id);
//         }
//       }
//     }
    
//     console.log(`🎉 All tables updated successfully for payment: ${payment._id}`);
//   } catch (error) {
//     console.error('💥 Error updating payment status:', error.message);
//     throw error;
//   }
// }


// Helper: Process Payment Completion
async function processPaymentCompletion(giftId, stripeSessionId, buyerEmail, status = PAYMENT_STATUSES.COMPLETE) {
  console.log('🔄 Processing payment completion for gift:', giftId);

  try {
    await updatePaymentStatus(stripeSessionId, status);

    const gift = await Gift.findById(giftId);
    if (!gift) throw new Error(`Gift not found: ${giftId}`);

    console.log(`✅ All tables updated via updatePaymentStatus for gift: ${gift._id}`);

    // FIXED: Add more detailed logging and ensure proper conversion
    if (gift.giftType === 'image' && gift.selectedImageId) {
      console.log('🖼️ Processing image gift - selectedImageId:', gift.selectedImageId);
      console.log('🖼️ Available images:', gift.images.map(img => ({ id: img._id.toString(), url: img.url })));
      
      const selectedImage = gift.images.find(img => {
        const match = img._id.toString() === gift.selectedImageId.toString();
        console.log('🔍 Comparing:', img._id.toString(), 'with', gift.selectedImageId.toString(), '- Match:', match);
        return match;
      });
      
      if (selectedImage) {
        gift.generatedContent = selectedImage.url;
        console.log('✅ Selected image set as generated content:', selectedImage.url);
        await gift.save();
        console.log('✅ Gift saved with generatedContent');
      } else {
        console.error('❌ Selected image not found in gift.images array');
        console.error('❌ selectedImageId:', gift.selectedImageId);
        console.error('❌ Available image IDs:', gift.images.map(img => img._id.toString()));
      }
    }

    if (gift.deliveryMethod === 'email' && gift.deliveryEmail && status === PAYMENT_STATUSES.COMPLETE) {
      const now = new Date();
      const scheduledDate = gift.scheduledDate ? new Date(gift.scheduledDate) : now;

      if (scheduledDate <= now) {
        // FIXED: Reload gift to ensure we have the updated generatedContent
        const updatedGift = await Gift.findById(giftId);
        console.log('📧 Sending gift email with generatedContent:', updatedGift.generatedContent);
        
        const giftResult = await nodemailerService.sendGiftEmail({
          ...updatedGift.toObject(),
          buyerEmail: buyerEmail || updatedGift.deliveryEmail,
        });

        if (giftResult.success) {
          updatedGift.deliveryStatus = 'delivered';
          updatedGift.deliveredAt = new Date();
          await updatedGift.save();
          console.log(`✅ Gift delivered immediately: ${updatedGift._id}`);
        } else {
          updatedGift.deliveryStatus = 'failed';
          await updatedGift.save();
          console.error(`❌ Failed to send immediate gift email: ${updatedGift._id}`, giftResult.error);
        }
      } else {
        gift.deliveryStatus = 'scheduled';
        await gift.save();
        console.log(`📅 Gift scheduled for delivery: ${gift._id}`);
      }
    }

    return { success: true, gift };
  } catch (error) {
    console.error('❌ Error in processPaymentCompletion:', error);
    throw error;
  }
}

// Payment Status Check
router.get('/status/:giftId', async (req, res) => {
  try {
    const { giftId } = req.params;
    const order = await Order.findOne({ giftId });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const payment = await Payment.findById(order.payment);
    res.json({
      giftId,
      paymentStatus: order.paymentStatus,
      orderId: order._id,
      paymentId: order.payment,
      transactionId: payment?.transactionId || null,
      amount: payment?.amount || order.price,
      completedAt: order.completedAt,
    });
  } catch (error) {
    console.error('Error checking payment status:', error.message);
    res.status(500).json({ message: 'Error checking payment status', error: error.message });
  }
});

// Complete Payment (Fallback)
router.post('/complete-payment/:giftId', async (req, res) => {
  try {
    const { giftId } = req.params;
    const { buyerEmail, stripeSessionId } = req.body;

    const result = await processPaymentCompletion(giftId, stripeSessionId, buyerEmail, PAYMENT_STATUSES.COMPLETE);
    res.json({
      message: 'Payment completed and gift processed',
      status: PAYMENT_STATUSES.COMPLETE,
      giftId,
    });
  } catch (error) {
    console.error('Error completing payment:', error.message);
    res.status(500).json({
      message: 'Error completing payment',
      status: PAYMENT_STATUSES.ERROR,
      error: error.message,
    });
  }
});

// Test Webhook Endpoint
router.post('/test-webhook', async (req, res) => {
  try {
    const { sessionId, giftId, buyerEmail } = req.body;
    console.log('🧪 Testing webhook manually for session:', sessionId);
    await processPaymentCompletion(giftId, sessionId, buyerEmail, PAYMENT_STATUSES.COMPLETE);
    res.json({ message: 'Test webhook processed successfully', status: PAYMENT_STATUSES.COMPLETE });
  } catch (error) {
    console.error('Test webhook error:', error.message);
    res.status(500).json({ message: 'Test webhook error', status: PAYMENT_STATUSES.ERROR, error: error.message });
  }
});

// Check Existing Payment
router.get('/existing-payment/:giftId', async (req, res) => {
  try {
    const { giftId } = req.params;
    const order = await Order.findOne({ giftId });
    if (!order) {
      return res.status(404).json({ message: 'No order found for this gift' });
    }

    const payment = order.payment ? await Payment.findById(order.payment) : null;
    res.json({
      giftId,
      orderId: order._id,
      paymentStatus: order.paymentStatus,
      paymentId: payment?._id,
      stripeSessionId: payment?.stripeSessionId,
      amount: order.price,
      createdAt: order.createdAt,
      completedAt: order.completedAt,
    });
  } catch (error) {
    console.error('Error checking existing payment:', error.message);
    res.status(500).json({ message: 'Error checking existing payment', error: error.message });
  }
});

router.post('/sync-payment/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log('🔄 Manual payment sync requested for session:', sessionId);

    // Verify session with Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        message: 'Stripe session not found' 
      });
    }

    console.log('✅ Stripe session found:', {
      id: session.id,
      payment_status: session.payment_status,
      status: session.status
    });

    // Check if payment was successful in Stripe
    if (session.payment_status === 'paid' && session.status === 'complete') {
      const { giftId, buyerEmail, paymentId } = session.metadata;
      
      // Check current database status
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        return res.status(404).json({ 
          success: false, 
          message: 'Payment record not found in database' 
        });
      }

      // If payment is still pending in database but completed in Stripe, sync it
      if (payment.status === 'pending') {
        console.log('🔄 Syncing payment status from Stripe to database...');
        
        await processPaymentCompletion(giftId, sessionId, buyerEmail, PAYMENT_STATUSES.COMPLETE);
        
        // Send confirmation email if not sent already
        const gift = await Gift.findById(giftId);
        if (gift) {
          await nodemailerService.sendPaymentConfirmation({
            buyerEmail,
            giftType: gift.type || 'unknown',
            amount: session.amount_total / 100,
            transactionId: session.payment_intent,
          });
          console.log('✅ Payment confirmation email sent');
        }

        res.json({
          success: true,
          message: 'Payment synced successfully',
          status: 'completed',
          giftId,
          paymentId,
          transactionId: session.payment_intent,
          amount: session.amount_total / 100,
          synced: true
        });
      } else {
        res.json({
          success: true,
          message: 'Payment already synced',
          status: payment.status,
          giftId,
          paymentId,
          synced: false
        });
      }
    } else {
      res.json({
        success: false,
        message: 'Payment not completed in Stripe',
        stripe_status: session.status,
        payment_status: session.payment_status
      });
    }
  } catch (error) {
    console.error('💥 Error in manual payment sync:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error syncing payment',
      error: error.message
    });
  }
});

// Auto-sync route for frontend to check and sync payments
router.post('/auto-sync/:giftId', async (req, res) => {
  try {
    const { giftId } = req.params;
    console.log('🔄 Auto-sync requested for gift:', giftId);

    // Find the order and payment
    const order = await Order.findOne({ giftId }).populate('payment');
    if (!order || !order.payment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order or payment not found' 
      });
    }

    const payment = order.payment;
    
    // If payment is pending, check Stripe status
    if (payment.status === 'pending' && payment.stripeSessionId) {
      const session = await stripe.checkout.sessions.retrieve(payment.stripeSessionId);
      
      if (session.payment_status === 'paid' && session.status === 'complete') {
        console.log('🔄 Auto-syncing payment from Stripe...');
        
        const { buyerEmail } = session.metadata;
        await processPaymentCompletion(giftId, payment.stripeSessionId, buyerEmail, PAYMENT_STATUSES.COMPLETE);
        
        res.json({
          success: true,
          message: 'Payment auto-synced successfully',
          status: 'completed',
          giftId,
          paymentId: payment._id,
          synced: true
        });
      } else {
        res.json({
          success: false,
          message: 'Payment still pending in Stripe',
          status: 'pending',
          stripe_status: session.status
        });
      }
    } else {
      res.json({
        success: true,
        message: 'Payment already processed',
        status: payment.status,
        synced: false
      });
    }
  } catch (error) {
    console.error('💥 Error in auto-sync:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error in auto-sync',
      error: error.message
    });
  }
});

export default router;