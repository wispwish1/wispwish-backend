import Joi from 'joi';

export const chargeSchema = Joi.object({
  amount: Joi.number().positive().required(),
  currency: Joi.string().default('usd'),
  planType: Joi.string().valid('monthly', 'weekly', 'pay_per_gift').default('pay_per_gift'),
  giftUsageCount: Joi.number().min(0).default(0),
  expiryDate: Joi.date().optional(),
  description: Joi.string().allow('', null),
  metadata: Joi.object().default({}),
});
