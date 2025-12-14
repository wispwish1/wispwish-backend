import Subscription from '../models/Subscription.js';

// Loads the active subscription (if any) and expires outdated ones.
export const checkSubscription = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User is missing on request context' });
    }

    const now = new Date();

    let subscription = await Subscription.findOne({
      user: req.user._id,
      status: 'active',
    }).sort({ endDate: -1 });

    if (subscription && subscription.endDate < now) {
      subscription.status = 'expired';
      await subscription.save();
      subscription = null;
    }

    req.subscription = subscription;
    next();
  } catch (error) {
    next(error);
  }
};
