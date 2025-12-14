import { manualCharge } from '../services/paymentService.js';

export const chargePayment = async (req, res, next) => {
  try {
    const { amount, currency, planType, giftUsageCount, expiryDate, description, metadata } = req.body;

    const payment = await manualCharge({
      userId: req.user._id,
      amount,
      currency,
      planType,
      giftUsageCount,
      expiryDate,
      description,
      metadata,
    });

    res.status(201).json({
      message: 'Payment recorded',
      payment,
    });
  } catch (error) {
    next(error);
  }
};
