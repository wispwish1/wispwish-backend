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
    const giftResult = await nodemailerService.sendGiftEmail({
      ...gift.toObject(),
      buyerEmail: gift.deliveryEmail
    });

    if (giftResult.success) {
      gift.deliveryStatus = 'delivered';
      gift.deliveredAt = new Date();
      await gift.save();
      console.log(`✅ Scheduled gift sent to ${gift.deliveryEmail}`);
    }
  }
});
