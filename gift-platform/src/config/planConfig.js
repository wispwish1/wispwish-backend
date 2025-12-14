export const PLAN_DEFINITIONS = {
  monthly: {
    type: 'monthly',
    amount: 29.99,
    currency: 'usd',
    durationDays: 30,
    freeGiftsPerPeriod: 1,
    description: 'Monthly plan with one free gift per billing period',
  },
  weekly: {
    type: 'weekly',
    amount: 34.99,
    currency: 'usd',
    durationDays: 30,
    totalWeeks: 4,
    freeGiftsPerWeek: 1,
    description: 'Weekly plan valid for 30 days with one free gift per week',
  },
};

export const getPlanDefinition = (planType) => PLAN_DEFINITIONS[planType];
