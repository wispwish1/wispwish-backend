import cron from 'node-cron';
import Gift from '../models/Gift.js';
import nodemailerService from './nodemailerService.js';

class ScheduledDeliveryService {
  constructor() {
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      console.log('📅 Scheduled delivery service is already running');
      return;
    }

    // Run every minute for timely deliveries
    cron.schedule('* * * * *', async () => {
      await this.checkAndDeliverScheduledGifts();
    });

    this.isRunning = true;
    console.log('📅 Scheduled delivery service started');

    // Kick off an immediate check on startup
    this.checkAndDeliverScheduledGifts().catch(err => {
      console.error('💥 Initial scheduled delivery check failed:', err?.message || err);
    });
  }

  async checkAndDeliverScheduledGifts() {
    try {
      const now = new Date();
      
      // Find gifts that are scheduled for delivery and payment is completed
      const scheduledGifts = await Gift.find({
        deliveryStatus: 'scheduled',
        paymentStatus: 'completed',
        scheduledDate: { $lte: now },
        deliveryMethod: 'email',
        deliveryEmail: { $exists: true, $ne: '' }
      });

      console.log(`📅 Found ${scheduledGifts.length} gifts ready for scheduled delivery at ${now.toISOString()}`);

      for (const gift of scheduledGifts) {
        try {
          console.log(`➡️  Processing scheduled gift ${gift._id} (type=${gift.giftType}) scheduledDate=${gift.scheduledDate?.toISOString?.()}`);
          // Handle WishKnot gifts differently
          if (gift.giftType === 'wishknot') {
            // Import WishKnot model dynamically
            const WishKnot = (await import('../models/WishKnot.js')).default;
            const wishKnot = await WishKnot.findOne({ giftId: gift._id });
            
            if (wishKnot) {
              console.log('🪢 Sending scheduled WishKnot email with access token:', wishKnot.accessToken);
              const wishKnotEmailResult = await nodemailerService.sendWishKnotEmail({
                recipientEmail: gift.deliveryEmail,
                recipientName: gift.recipientName,
                senderName: gift.senderName,
                knotType: wishKnot.knotType,
                occasion: gift.occasion,
                viewUrl: `${process.env.BASE_URL || 'http://localhost:5001'}/wishknot-view.html?giftId=${gift._id}&token=${wishKnot.accessToken}`,
                scheduledRevealDate: wishKnot.scheduledRevealDate
              });
              
              if (wishKnotEmailResult.success) {
                gift.deliveryStatus = 'delivered';
                gift.deliveredAt = new Date();
                await gift.save();
                await wishKnot.logInteraction('email_sent', { recipientEmail: gift.deliveryEmail });
                console.log(`✅ Scheduled WishKnot delivered: ${gift._id}`);
              } else {
                gift.deliveryStatus = 'failed';
                await gift.save();
                console.error(`❌ Failed to deliver scheduled WishKnot: ${gift._id}`, wishKnotEmailResult.error);
              }
            } else {
              console.error('❌ WishKnot record not found for scheduled gift:', gift._id);
              gift.deliveryStatus = 'failed';
              await gift.save();
            }
          } else {
            // Handle regular gifts
            const emailResult = await nodemailerService.sendGiftEmail({
              ...gift.toObject(),
              buyerEmail: gift.deliveryEmail
            });

            if (emailResult.success) {
              gift.deliveryStatus = 'delivered';
              gift.deliveredAt = new Date();
              await gift.save();
              console.log(`✅ Scheduled gift delivered: ${gift._id}`);
            } else {
              gift.deliveryStatus = 'failed';
              await gift.save();
              console.error(`❌ Failed to deliver scheduled gift: ${gift._id}`, emailResult.error);
            }
          }
        } catch (error) {
          console.error(`💥 Error delivering scheduled gift ${gift._id}:`, error.message);
          gift.deliveryStatus = 'failed';
          await gift.save();
        }
      }
    } catch (error) {
      console.error('💥 Error in scheduled delivery check:', error.message);
    }
  }
}

export default new ScheduledDeliveryService();