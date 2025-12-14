import User from '../models/User.js';

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const resolvePlanDates = (source = {}, now = new Date()) => {
  const activatedAt =
    toDate(source.planActivatedAt) ||
    toDate(source.startDate) ||
    toDate(source.currentPeriodStart) ||
    toDate(source.activatedAt) ||
    toDate(source.createdAt) ||
    now;

  let expiresAt =
    toDate(source.planExpiresAt) ||
    toDate(source.currentPeriodEnd) ||
    toDate(source.nextPaymentDate) ||
    toDate(source.expiresAt);

  if (!expiresAt && activatedAt) {
    const fallback = new Date(activatedAt);
    // Both Monthly and Weekly plans are billed monthly (30 days).
    // "frequency" determines how often the gift QUOTA resets, not the billing cycle.
    const durationDays = 30;
    fallback.setDate(fallback.getDate() + durationDays);
    expiresAt = fallback;
  }

  return {
    activatedAt,
    expiresAt,
  };
};

export const isPlanActive = (subscription, compareDate = new Date()) => {
  if (!subscription) return false;
  if (['cancelled', 'expired'].includes(subscription.status)) return false;
  const { expiresAt } = resolvePlanDates(subscription, compareDate);
  return !expiresAt || expiresAt > compareDate;
};

export const markSubscriptionExpiredIfNeeded = (subscription, compareDate = new Date()) => {
  if (!subscription) return false;
  if (isPlanActive(subscription, compareDate)) {
    return false;
  }
  if (subscription.status !== 'expired') {
    subscription.status = 'expired';
    subscription.planExpiresAt = subscription.planExpiresAt || compareDate;
    return true;
  }
  return false;
};

export const buildPlanResponse = (subscription) => {
  if (!subscription) return null;
  const { activatedAt, expiresAt } = resolvePlanDates(subscription);
  return {
    id: subscription._id,
    planId: subscription.planId,
    planName: subscription.planName,
    planDescription: subscription.planDescription,
    frequency: subscription.frequency,
    intervalCount: subscription.intervalCount,
    price: subscription.price,
    currency: subscription.currency,
    status: subscription.status,
    customerName: subscription.customerName,
    customerEmail: subscription.customerEmail,
    planActivatedAt: activatedAt,
    planExpiresAt: expiresAt,
    nextGiftDate: subscription.nextGiftDate,
    nextPaymentDate: subscription.nextPaymentDate,
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    metadata: subscription.metadata || {},
  };
};

export const syncUserPlanProfile = async (subscription, options = {}) => {
  if (!subscription || !subscription.userId) return null;

  const { activatedAt, expiresAt } = resolvePlanDates(subscription);
  const status = options.forceInactive
    ? 'inactive'
    : isPlanActive(subscription)
      ? 'active'
      : 'expired';

  return User.findByIdAndUpdate(
    subscription.userId,
    {
      plan: {
        activeSubscriptionId: status === 'active' ? subscription._id : null,
        planId: subscription.planId || null,
        planName: subscription.planName || null,
        frequency: subscription.frequency || null,
        planActivatedAt: activatedAt,
        planExpiresAt: expiresAt,
        status,
      },
    },
    { new: true }
  );
};
