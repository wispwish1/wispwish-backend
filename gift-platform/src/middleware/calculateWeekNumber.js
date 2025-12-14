// Enriches the request with the current week index of a weekly plan.
export const calculateWeekNumber = (req, res, next) => {
  const subscription = req.subscription;

  if (!subscription || subscription.planType !== 'weekly') {
    req.weekNumber = null;
    return next();
  }

  const now = new Date();
  const start = new Date(subscription.startDate);
  const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  const rawWeek = Math.floor(diffDays / 7) + 1;
  const weekNumber = Math.min(Math.max(rawWeek, 1), 4);

  req.weekNumber = weekNumber;
  next();
};
