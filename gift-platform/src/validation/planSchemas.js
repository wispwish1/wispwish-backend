import Joi from 'joi';

export const buyPlanSchema = Joi.object({
  planType: Joi.string().valid('monthly', 'weekly').required(),
});
