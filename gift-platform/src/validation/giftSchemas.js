import Joi from 'joi';

export const sendGiftSchema = Joi.object({
  title: Joi.string().min(3).max(120).required(),
  message: Joi.string().min(5).max(1000).required(),
  price: Joi.number().positive().precision(2).required(),
});

export const giftHistorySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
});
