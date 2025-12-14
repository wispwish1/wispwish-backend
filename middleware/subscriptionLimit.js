import Subscription from '../models/Subscription.js';
import { isPlanActive, resolvePlanDates, markSubscriptionExpiredIfNeeded } from '../utils/subscriptionUtils.js';

/**
 * Reset subscription period if it has expired
 * @param {Object} subscription - Subscription document
 * @returns {boolean} - Whether the period was reset
 */
async function resetPeriodIfExpired(subscription) {
  const now = new Date();

  // Initialize period dates if not set
  if (!subscription.periodStartDate || !subscription.periodEndDate) {
    subscription.periodStartDate = subscription.planActivatedAt || subscription.startDate || subscription.createdAt || now;

    if (subscription.frequency === 'weekly') {
      subscription.periodEndDate = new Date(subscription.periodStartDate);
      subscription.periodEndDate.setDate(subscription.periodEndDate.getDate() + 7);
    } else {
      // Monthly
      subscription.periodEndDate = new Date(subscription.periodStartDate);
      subscription.periodEndDate.setDate(subscription.periodEndDate.getDate() + 30);
    }

    subscription.giftCountThisPeriod = subscription.giftCountThisPeriod || 0;
    await subscription.save();
    return true;
  }

  // Check if current period has expired
  if (now > subscription.periodEndDate) {
    console.log('📅 Period expired, resetting quota...');
    console.log('   Old period end:', subscription.periodEndDate);

    // Reset the counter
    subscription.giftCountThisPeriod = 0;
    subscription.periodStartDate = now;

    if (subscription.frequency === 'weekly') {
      subscription.periodEndDate = new Date(now);
      subscription.periodEndDate.setDate(subscription.periodEndDate.getDate() + 7);
    } else {
      // Monthly
      subscription.periodEndDate = new Date(now);
      subscription.periodEndDate.setDate(subscription.periodEndDate.getDate() + 30);
    }

    console.log('   New period end:', subscription.periodEndDate);
    await subscription.save();
    return true;
  }

  return false;
}

/**
 * Check if user has exceeded their gift quota
 * @param {Object} subscription - Subscription document
 * @returns {Object} - { allowed: boolean, message: string, remaining: number }
 */
function checkQuotaLimit(subscription) {
  const limit = 1; // Both weekly and monthly get 1 gift per period
  const used = subscription.giftCountThisPeriod || 0;
  const remaining = Math.max(0, limit - used);

  console.log('🎁 Quota check:');
  console.log('   Plan type:', subscription.frequency);
  console.log('   Used:', used);
  console.log('   Limit:', limit);
  console.log('   Remaining:', remaining);

  if (used >= limit) {
    const periodLabel = subscription.frequency === 'weekly' ? 'week' : 'month';
    const resetDate = subscription.periodEndDate ? new Date(subscription.periodEndDate).toLocaleDateString() : 'your next billing date';

    return {
      allowed: false,
      message: `Your gift limit has been used. You can create another gift after ${resetDate}.`,
      remaining: 0,
      limit,
      used,
      resetDate: subscription.periodEndDate
    };
  }

  return {
    allowed: true,
    remaining,
    limit,
    used
  };
}

/**
 * Middleware to check subscription limits before gift creation
 */
export async function checkSubscriptionLimit(req, res, next) {
  try {
    const buyerEmail = req.body.buyerEmail || req.user?.email;
    const userId = req.user?.id || req.user?._id || null;

    console.log('\n========== QUOTA VALIDATION START ==========');
    console.log('Email:', buyerEmail);
    console.log('User ID:', userId);

    // If no email provided, allow creation (non-subscription/guest user)
    if (!buyerEmail) {
      console.log('No email - allowing guest gift creation');
      return next();
    }

    // Find active subscription
    const subscriptionQuery = {
      $or: [{ customerEmail: buyerEmail.toLowerCase() }]
    };
    if (userId) {
      subscriptionQuery.$or.push({ userId: userId });
    }

    const subscription = await Subscription.findOne(subscriptionQuery).sort({ createdAt: -1 });

    // No subscription = regular paid gift (no quota check needed)
    if (!subscription) {
      console.log('No subscription found - allowing regular gift');
      return next();
    }

    console.log('Subscription found:', subscription._id);
    console.log('Plan:', subscription.frequency);
    console.log('Status:', subscription.status);

    // Check if subscription is active
    const planActive = isPlanActive(subscription);
    if (!planActive) {
      console.log('Subscription not active - allowing regular gift');
      if (markSubscriptionExpiredIfNeeded(subscription)) {
        await subscription.save();
      }
      return next();
    }

    // Reset period if expired
    await resetPeriodIfExpired(subscription);

    // Check quota limit
    const quotaResult = checkQuotaLimit(subscription);

    console.log('Quota result:', quotaResult);
    console.log('========== QUOTA VALIDATION END ==========\n');

    if (!quotaResult.allowed) {
      return res.status(429).json({
        success: false,
        message: quotaResult.message,
        limit: quotaResult.limit,
        used: quotaResult.used,
        remaining: quotaResult.remaining,
        resetDate: quotaResult.resetDate,
        subscriptionType: subscription.frequency,
        periodEndDate: subscription.periodEndDate
      });
    }

    // Attach subscription to request for use after gift creation
    req.subscription = subscription;
    next();
  } catch (error) {
    console.error('Error in quota validation:', error);
    // On error, block to be safe
    return res.status(500).json({
      success: false,
      message: 'Error checking gift quota. Please try again.'
    });
  }
}

/**
 * Increment gift count after successful gift creation
 * Call this AFTER gift is successfully created
 */
export async function incrementGiftCount(subscription) {
  if (!subscription) return;

  try {
    subscription.giftCountThisPeriod = (subscription.giftCountThisPeriod || 0) + 1;
    subscription.lastGiftDate = new Date();
    await subscription.save();

    console.log('✅ Gift count incremented:');
    console.log('   New count:', subscription.giftCountThisPeriod);
    console.log('   Period ends:', subscription.periodEndDate);
  } catch (error) {
    console.error('Error incrementing gift count:', error);
  }
}

/**
 * Check if user can create a gift (for frontend status check)
 */
export async function canCreateGift(email, userId = null) {
  try {
    if (!email) return { canCreate: true, planStatus: 'none' };

    const subscriptionQuery = {
      $or: [{ customerEmail: email.toLowerCase() }]
    };
    if (userId) {
      subscriptionQuery.$or.push({ userId: userId });
    }

    const subscription = await Subscription.findOne(subscriptionQuery).sort({ createdAt: -1 });

    if (!subscription) {
      return { canCreate: true, planStatus: 'none' };
    }

    const planDates = resolvePlanDates(subscription);
    const planActive = isPlanActive(subscription);

    if (!planActive) {
      if (markSubscriptionExpiredIfNeeded(subscription)) {
        await subscription.save();
      }
      return {
        canCreate: true,
        planStatus: 'expired',
        subscriptionType: subscription.frequency,
        planName: subscription.planName
      };
    }

    // Reset period if expired
    await resetPeriodIfExpired(subscription);

    // Check quota
    const quotaResult = checkQuotaLimit(subscription);

    const periodLabel = subscription.frequency === 'weekly' ? 'week' : 'month';

    return {
      canCreate: quotaResult.allowed,
      limit: quotaResult.limit,
      used: quotaResult.used,
      remaining: quotaResult.remaining,
      subscriptionType: subscription.frequency,
      planName: subscription.planName,
      planActivatedAt: planDates.activatedAt,
      planExpiresAt: planDates.expiresAt,
      planStatus: 'active',
      resetDate: subscription.periodEndDate,
      periodLabel,
      message: quotaResult.allowed
        ? `${quotaResult.remaining} gift remaining this ${periodLabel}`
        : `Your gift limit has been used.`
    };
  } catch (error) {
    console.error('Error in canCreateGift:', error);
    return { canCreate: true, planStatus: 'unknown' };
  }
}
