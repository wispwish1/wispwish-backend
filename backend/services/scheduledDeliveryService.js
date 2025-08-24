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

    // Run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      await this.checkAndDeliverScheduledGifts();
    });

    this.isRunning = true;
    console.log('📅 Scheduled delivery service started');
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

      console.log(`📅 Found ${scheduledGifts.length} gifts ready for scheduled delivery`);

      for (const gift of scheduledGifts) {
        try {
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