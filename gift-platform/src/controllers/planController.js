import { getPlanDefinition } from '../config/planConfig.js';
import Subscription from '../models/Subscription.js';
import { createPlanPayment } from '../services/paymentService.js';

const buildWeeklyUsage = (totalWeeks) =>
  Array.from({ length: totalWeeks }, (_, index) => ({
    weekNumber: index + 1,
    used: false,
  }));

export const buyPlan = async (req, res, next) => {
  try {
    const { planType } = req.body;
    const userId = req.user._id;

    const planDefinition = getPlanDefinition(planType);

    if (!planDefinition) {
      return res.status(400).json({ message: 'Invalid plan type' });
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + planDefinition.durationDays);

    await Subscription.updateMany({ user: userId, status: 'active' }, { status: 'expired' });

    const payment = await createPlanPayment({
      userId,
      planType,
      amount: planDefinition.amount,
      currency: planDefinition.currency,
      expiryDate: endDate,
      giftUsageCount:
        planType === 'monthly'
          ? planDefinition.freeGiftsPerPeriod
          : planDefinition.totalWeeks * planDefinition.freeGiftsPerWeek,
      metadata: { planType },
    });

    if (payment.status !== 'succeeded') {
      return res.status(402).json({ message: 'Plan payment failed', payment });
    }

    const subscription = await Subscription.create({
      user: userId,
      planType,
      startDate,
      endDate,
      weeklyUsage: planType === 'weekly' ? buildWeeklyUsage(planDefinition.totalWeeks) : [],
      payment: payment._id,
    });

    payment.subscription = subscription._id;
    await payment.save();

    res.status(201).json({
      subscription,
      payment,
    });
  } catch (error) {
    next(error);
  }
};

export const getActivePlan = async (req, res, next) => {
  try {
    const subscription = req.subscription;

    if (!subscription) {
      return res.json({ active: false });
    }

    res.json({
      active: true,
      plan: {
        id: subscription._id,
        planType: subscription.planType,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        freeGiftsUsed: subscription.freeGiftsUsed,
        weeklyUsage: subscription.weeklyUsage,
      },
    });
  } catch (error) {
    next(error);
  }
};
