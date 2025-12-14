import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import Payment from '../models/Payment.js';

let stripeClient;
const getStripeClient = () => {
  if (stripeClient === undefined) {
    const secret = process.env.STRIPE_SECRET_KEY;
    stripeClient = secret ? new Stripe(secret, { apiVersion: '2023-10-16' }) : null;
  }
  return stripeClient;
};

const runCharge = async ({ amount, currency, description, metadata }) => {
  const client = getStripeClient();

  if (!client) {
    return {
      id: `dummy_${uuidv4()}`,
      status: 'succeeded',
      provider: 'mock',
      metadata,
    };
  }

  const paymentIntent = await client.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency,
    payment_method: 'pm_card_visa',
    confirm: true,
    description,
    metadata,
  });

  return {
    id: paymentIntent.id,
    status: paymentIntent.status,
    provider: 'stripe',
    metadata: paymentIntent.metadata,
  };
};

const persistPayment = async ({
  userId,
  planType,
  amount,
  currency,
  expiryDate,
  giftUsageCount,
  subscriptionId,
  giftId,
  providerPaymentId,
  provider,
  status,
  notes,
}) => {
  return Payment.create({
    user: userId,
    planType,
    amount,
    currency,
    expiryDate,
    giftUsageCount,
    subscription: subscriptionId,
    gift: giftId,
    providerPaymentId,
    provider,
    status,
    notes,
    purchaseDate: new Date(),
  });
};

export const createPlanPayment = async ({
  userId,
  planType,
  amount,
  currency = 'usd',
  expiryDate,
  giftUsageCount,
  metadata = {},
}) => {
  const description = `Purchase of ${planType} plan`;
  const charge = await runCharge({ amount, currency, description, metadata });

  return persistPayment({
    userId,
    planType,
    amount,
    currency,
    expiryDate,
    giftUsageCount,
    providerPaymentId: charge.id,
    provider: charge.provider,
    status: charge.status === 'succeeded' ? 'succeeded' : 'failed',
    notes: metadata.note,
  });
};

export const createGiftPayment = async ({
  userId,
  amount,
  currency = 'usd',
  subscriptionId,
  planType = 'pay_per_gift',
  giftId,
}) => {
  const description = 'Individual gift purchase';
  const charge = await runCharge({ amount, currency, description, metadata: { planType } });

  return persistPayment({
    userId,
    planType,
    amount,
    currency,
    subscriptionId,
    giftId,
    giftUsageCount: 1,
    providerPaymentId: charge.id,
    provider: charge.provider,
    status: charge.status === 'succeeded' ? 'succeeded' : 'failed',
  });
};

export const manualCharge = async ({
  userId,
  amount,
  currency = 'usd',
  planType = 'pay_per_gift',
  giftUsageCount = 0,
  expiryDate,
  description = 'Manual charge',
  metadata = {},
}) => {
  const charge = await runCharge({
    amount,
    currency,
    description,
    metadata,
  });

  return persistPayment({
    userId,
    planType,
    amount,
    currency,
    expiryDate,
    giftUsageCount,
    providerPaymentId: charge.id,
    provider: charge.provider,
    status: charge.status === 'succeeded' ? 'succeeded' : 'failed',
    notes: description,
  });
};
