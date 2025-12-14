// Determines if the current request qualifies for a free gift.
export const checkGiftEligibility = (req, res, next) => {
  const subscription = req.subscription;

  if (!subscription) {
    req.giftEligibility = {
      isFree: false,
      reason: 'No active plan',
      planType: 'pay_per_gift',
    };
    return next();
  }

  if (subscription.planType === 'monthly') {
    const available = subscription.freeGiftsUsed < 1;
    req.giftEligibility = {
      isFree: available,
      reason: available ? 'Monthly free gift available' : 'Monthly free gift already used',
      planType: subscription.planType,
    };
    return next();
  }

  if (subscription.planType === 'weekly') {
    const weekNumber = req.weekNumber || 1;
    const weeklyRecord = subscription.weeklyUsage.find((entry) => entry.weekNumber === weekNumber);
    const available = weeklyRecord ? !weeklyRecord.used : true;

    req.giftEligibility = {
      isFree: available,
      reason: available ? 'Weekly free gift available' : `Free gift already used for week ${weekNumber}`,
      planType: subscription.planType,
      weekNumber,
    };

    return next();
  }

  req.giftEligibility = {
    isFree: false,
    reason: 'Unknown plan',
    planType: subscription.planType,
  };

  return next();
};
