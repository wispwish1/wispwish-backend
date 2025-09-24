// import cron from 'node-cron';

// // Schedule a task to check for pending gifts
// cron.schedule('* * * * *', async () => {
//   console.log('🔄 Checking for scheduled gifts...');
//   const now = new Date();
//   const pendingGifts = await Gift.find({
//     deliveryMethod: 'email',
//     deliveryStatus: { $ne: 'delivered' },
//     scheduledDate: { $lte: now },
//   });

//   for (const gift of pendingGifts) {
//     try {
//       const giftResult = await nodemailerService.sendGiftEmail({
//         ...gift.toObject(),
//         buyerEmail: gift.deliveryEmail,
//       });

//       if (giftResult.success) {
//         gift.deliveryStatus = 'delivered';
//         gift.deliveredAt = new Date();
//         await gift.save();
//         console.log(`✅ Scheduled gift delivered: ${gift._id}`);
//       } else {
//         console.error(`❌ Failed to send scheduled gift email: ${gift._id}`);
//       }
//     } catch (error) {
//       console.error(`💥 Error sending scheduled gift: ${gift._id}`, error.message);
//     }
//   }
// });

import cron from 'node-cron';
import Gift from '../models/Gift.js';
import nodemailerService from '../services/nodemailerService.js';

cron.schedule('* * * * *', async () => { // har minute
  const now = new Date();
  const pendingGifts = await Gift.find({
    deliveryMethod: 'email',
    deliveryStatus: { $ne: 'delivered' },
    scheduledDate: { $lte: now }
  });

  for (const gift of pendingGifts) {
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
          console.log(`✅ Scheduled WishKnot sent to ${gift.deliveryEmail}`);
        } else {
          gift.deliveryStatus = 'failed';
          await gift.save();
          console.error(`❌ Failed to send scheduled WishKnot email: ${wishKnotEmailResult.error}`);
        }
      } else {
        console.error('❌ WishKnot record not found for scheduled gift:', gift._id);
        gift.deliveryStatus = 'failed';
        await gift.save();
      }
    } else {
      // Handle regular gifts
      const giftResult = await nodemailerService.sendGiftEmail({
        ...gift.toObject(),
        buyerEmail: gift.deliveryEmail
      });

      if (giftResult.success) {
        gift.deliveryStatus = 'delivered';
        gift.deliveredAt = new Date();
        await gift.save();
        console.log(`✅ Scheduled gift sent to ${gift.deliveryEmail}`);
      } else {
        gift.deliveryStatus = 'failed';
        await gift.save();
        console.error(`❌ Failed to send scheduled gift email: ${giftResult.error}`);
      }
    }
  }
});
