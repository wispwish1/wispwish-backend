import Gift from '../models/Gift.js';
import GiftUsageLog from '../models/GiftUsageLog.js';
import { createGiftPayment } from '../services/paymentService.js';

// Updates the subscription counters whenever a free gift is consumed.
const markFreeGiftUsage = (subscription, weekNumber) => {
  if (!subscription) return subscription;

  if (subscription.planType === 'monthly') {
    subscription.freeGiftsUsed += 1;
  } else if (subscription.planType === 'weekly') {
    const weeklyRecordIndex = subscription.weeklyUsage.findIndex((entry) => entry.weekNumber === weekNumber);
    if (weeklyRecordIndex >= 0) {
      subscription.weeklyUsage[weeklyRecordIndex].used = true;
      subscription.weeklyUsage[weeklyRecordIndex].usedAt = new Date();
    } else {
      subscription.weeklyUsage.push({
        weekNumber,
        used: true,
        usedAt: new Date(),
      });
    }
  }

  subscription.giftUsageCount += 1;
  return subscription;
};

export const sendGift = async (req, res, next) => {
  try {
    const { title, message, price } = req.body;
    const subscription = req.subscription;
    const eligibility = req.giftEligibility;

    let isFree = eligibility?.isFree ?? false;
    let chargedAmount = 0;
    let paymentRecord;

    if (isFree && !subscription) {
      isFree = false;
    }

    if (isFree) {
      // Free gifts still mutate the subscription to prevent duplicate use.
      markFreeGiftUsage(subscription, eligibility.weekNumber || 1);
      await subscription.save();
    } else {
      paymentRecord = await createGiftPayment({
        userId: req.user._id,
        amount: price,
        subscriptionId: subscription?._id,
        planType: subscription ? subscription.planType : 'pay_per_gift',
      });
      chargedAmount = price;
      if (subscription) {
        subscription.giftUsageCount += 1;
        await subscription.save();
      }
    }

    const gift = await Gift.create({
      user: req.user._id,
      subscription: subscription?._id,
      title,
      message,
      price,
      isFree,
      chargedAmount,
    });

    if (paymentRecord) {
      paymentRecord.gift = gift._id;
      await paymentRecord.save();
    }

    await GiftUsageLog.create({
      user: req.user._id,
      gift: gift._id,
      subscription: subscription?._id,
      planType: subscription ? subscription.planType : 'pay_per_gift',
      isFree,
      weekNumber: eligibility?.weekNumber,
      chargedAmount,
      note: isFree ? 'Free gift benefit applied' : 'Charged at gift price',
    });

    res.status(201).json({
      message: isFree ? 'Gift sent for free' : 'Gift sent',
      data: gift,
      eligibility,
    });
  } catch (error) {
    next(error);
  }
};

export const getGiftHistory = async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 50);

    const logs = await GiftUsageLog.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('gift')
      .populate('subscription');

    res.json({
      count: logs.length,
      logs,
    });
  } catch (error) {
    next(error);
  }
};
