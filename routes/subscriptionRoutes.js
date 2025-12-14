import express from 'express';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';

const router = express.Router();

// Initialize Stripe
let stripe;
try {
    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_dummy_key_for_testing') {
        console.warn('⚠️ STRIPE_SECRET_KEY is not configured - subscription processing will not work');
        stripe = null;
    } else {
        stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
} catch (error) {
    console.warn('⚠️ Stripe initialization failed:', error.message);
    stripe = null;
}

// Subscription plans configuration
const SUBSCRIPTION_PLANS = [
    {
        id: 'monthly',
        name: 'Monthly Plan',
        description: 'Perfect for milestone gifting',
        frequencyLabel: '1 Gift per Month',
        frequency: 'monthly',
        billingInterval: 'month',
        intervalCount: 1,
        price: 15,
        currency: 'aud',
        priceLabel: '$15 / month',
        badge: 'Most Loved',
        popular: true
    },
    {
        id: 'weekly',
        name: 'Weekly Plan',
        description: 'For ongoing support & healing',
        frequencyLabel: '4 Gifts per Month',
        frequency: 'weekly',
        billingInterval: 'month',
        intervalCount: 1,
        price: 28,
        currency: 'aud',
        priceLabel: '$28 / month',
        badge: 'Deep Care'
    }
];

const SUBSCRIPTION_STATUSES = {
    PENDING: 'pending',
    ACTIVE: 'active',
    EXPIRED: 'expired',
    CANCELLED: 'cancelled'
};

// Helper to get or create Stripe customer
async function getOrCreateCustomer(userId, email, name) {
    if (!stripe) {
        throw new Error('Stripe is not configured');
    }
    try {
        let stripeCustomerId;
        if (userId && userId !== 'guest') {
            const user = await User.findById(userId);
            if (!user) throw new Error('User not found');
            stripeCustomerId = user.stripeCustomerId;
            if (!stripeCustomerId) {
                const customer = await stripe.customers.create({ email, name });
                stripeCustomerId = customer.id;
                user.stripeCustomerId = stripeCustomerId;
                await user.save();
                console.log(`✅ Created Stripe customer: ${stripeCustomerId} for user: ${userId}`);
            }
        } else {
            const customer = await stripe.customers.create({ email, name });
            stripeCustomerId = customer.id;
            console.log(`✅ Created Stripe customer for guest: ${stripeCustomerId}`);
        }
        return stripeCustomerId;
    } catch (error) {
        console.error('Error creating Stripe customer:', error.message);
        throw error;
    }
}

// Helper to get frontend base URL
function getFrontendBaseURL(req) {
    if (process.env.FRONTEND_URL) {
        return process.env.FRONTEND_URL.replace(/\/$/, '');
    }

    // For local development, default to port 5500 (Live Server) used by frontend
    const host = req.headers.host || '';
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
        return 'http://127.0.0.1:5500';
    }

    // Fallback for production if env var not set (same domain)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    return `${protocol}://${host}`;
}

// GET /api/subscriptions/plans - Get all subscription plans
router.get('/plans', (req, res) => {
    res.json({
        success: true,
        plans: SUBSCRIPTION_PLANS
    });
});

// POST /api/subscriptions/check-existing - Check if user has active subscription
router.post('/check-existing', async (req, res) => {
    try {
        // Verify authentication
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Login required',
                hasActiveSubscription: false
            });
        }

        // Verify token
        let authUser = null;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            authUser = await User.findById(decoded.userId);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Your session has expired. Please log in again.',
                    tokenExpired: true,
                    hasActiveSubscription: false
                });
            }
            return res.status(403).json({
                success: false,
                message: 'Invalid token',
                hasActiveSubscription: false
            });
        }

        if (!authUser) {
            return res.status(401).json({
                success: false,
                message: 'User not found',
                hasActiveSubscription: false
            });
        }

        // Check for active subscription
        const activeSubscription = await Subscription.findOne({
            userId: authUser._id.toString(),
            status: SUBSCRIPTION_STATUSES.ACTIVE,
            $or: [
                { planExpiresAt: { $exists: false } },
                { planExpiresAt: null },
                { planExpiresAt: { $gt: new Date() } }
            ]
        }).sort({ createdAt: -1 });

        if (activeSubscription) {
            return res.json({
                success: true,
                hasActiveSubscription: true,
                message: 'You already have an active subscription.',
                subscription: {
                    planName: activeSubscription.planName,
                    planId: activeSubscription.planId,
                    frequency: activeSubscription.frequency,
                    status: activeSubscription.status,
                    planActivatedAt: activeSubscription.planActivatedAt,
                    planExpiresAt: activeSubscription.planExpiresAt
                }
            });
        }

        return res.json({
            success: true,
            hasActiveSubscription: false,
            message: 'No active subscription found'
        });

    } catch (error) {
        console.error('Error checking subscription:', error);
        return res.status(500).json({
            success: false,
            message: 'Error checking subscription status',
            hasActiveSubscription: false,
            error: error.message
        });
    }
});

// POST /api/subscriptions/create-subscription-session - Create Stripe checkout for subscription
router.post('/create-subscription-session', async (req, res) => {
    if (!stripe) {
        return res.status(503).json({
            success: false,
            message: 'Subscription processing is not available - Stripe not configured',
            error: 'STRIPE_NOT_CONFIGURED'
        });
    }

    try {
        const {
            planId,
            customerEmail,
            customerName,
            userId,
            subscriptionNotes
        } = req.body;

        console.log('📝 Subscription request received:', { planId, customerEmail, userId });

        // Verify authentication
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'Login required to start subscription checkout' });
        }

        let authUser = null;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            authUser = await User.findById(decoded.userId);
        } catch (err) {
            return res.status(403).json({ success: false, message: 'Invalid or expired login. Please log in again.' });
        }

        if (!authUser) {
            return res.status(401).json({ success: false, message: 'User not found. Please log in.' });
        }

        if (authUser.isActive === false) {
            return res.status(403).json({ success: false, message: 'Account is inactive. Please contact support.' });
        }

        // Get email from authenticated user first, then fallback to provided email
        const rawEmail = customerEmail || authUser.email || '';
        const normalizedEmail = rawEmail.trim().toLowerCase();

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: 'Valid email address is required. Please ensure your account has an email address.'
            });
        }

        if (!planId) {
            return res.status(400).json({ success: false, message: 'Plan ID is required' });
        }

        const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Subscription plan not found' });
        }

        const normalizedName = (typeof customerName === 'string' && customerName.trim().length > 0
            ? customerName.trim()
            : authUser.name || 'WispWish Friend');
        const cleanNotes = (typeof subscriptionNotes === 'string' ? subscriptionNotes.trim() : '').slice(0, 500);
        const normalizedUserId = authUser._id ? authUser._id.toString() : null;

        const stripeCustomerId = await getOrCreateCustomer(normalizedUserId, normalizedEmail, normalizedName);

        // Get frontend URL from request
        const frontendBaseURL = getFrontendBaseURL(req);

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: stripeCustomerId,
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: plan.currency,
                        unit_amount: plan.price * 100,
                        recurring: {
                            interval: plan.billingInterval,
                            interval_count: plan.intervalCount || 1
                        },
                        product_data: {
                            name: plan.name,
                            description: plan.description
                        }
                    },
                    quantity: 1
                }
            ],
            success_url: `${frontendBaseURL}/subscription-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${frontendBaseURL}/pricing.html?subscription=cancelled`,
            metadata: {
                planId: plan.id,
                planName: plan.name,
                planDescription: plan.description || '',
                frequency: plan.frequency,
                price: plan.price,
                currency: plan.currency,
                userId: normalizedUserId || 'guest',
                customerEmail: normalizedEmail,
                customerName: normalizedName,
                subscriptionNotes: cleanNotes
            }
        });

        console.log('✅ Stripe subscription session created:', session.id);

        await Subscription.findOneAndUpdate(
            { checkoutSessionId: session.id },
            {
                userId: normalizedUserId,
                planId: plan.id,
                planName: plan.name,
                planDescription: plan.description,
                frequency: plan.frequency,
                intervalCount: plan.intervalCount || 1,
                price: plan.price,
                currency: plan.currency,
                stripeCustomerId,
                checkoutSessionId: session.id,
                status: SUBSCRIPTION_STATUSES.PENDING,
                customerName: normalizedName,
                customerEmail: normalizedEmail,
                subscriptionNotes: cleanNotes,
                nextGiftDate: new Date(),
                metadata: {
                    ...(plan.frequencyLabel ? { frequencyLabel: plan.frequencyLabel } : {}),
                    ...(plan.badge ? { badge: plan.badge } : {})
                }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        res.json({
            success: true,
            checkoutUrl: session.url,
            sessionId: session.id
        });
    } catch (error) {
        console.error('Subscription checkout error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to start subscription checkout',
            error: error.message
        });
    }
});

// GET /api/subscriptions/subscription-status - Get subscription status by session ID
router.get('/subscription-status', async (req, res) => {
    try {
        const { session_id } = req.query;

        if (!session_id) {
            return res.status(400).json({
                success: false,
                message: 'Session ID is required'
            });
        }

        const subscription = await Subscription.findOne({ checkoutSessionId: session_id });

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'Subscription not found'
            });
        }

        res.json({
            success: true,
            subscription: {
                planName: subscription.planName,
                frequency: subscription.frequency,
                price: subscription.price,
                currency: subscription.currency,
                status: subscription.status,
                currentPeriodEnd: subscription.currentPeriodEnd,
                planActivatedAt: subscription.planActivatedAt,
                planExpiresAt: subscription.planExpiresAt
            }
        });
    } catch (error) {
        console.error('Error fetching subscription status:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error fetching subscription status',
            error: error.message
        });
    }
});

export default router;
