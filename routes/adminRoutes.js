import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import User from '../models/User.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import APIUsage from '../models/APIUsage.js';
import SiteContent from '../models/Content.js';
import EmailTemplate from '../models/EmailTemplate.js';
import nodemailerService from '../services/nodemailerService.js';
import GiftTemplate from '../models/Gift.js';
import VoiceStyle from '../models/VoiceStyle.js';


// import emailTemplateService from '../services/emailTemplateService.js';

const router = express.Router();

// Admin authentication middleware
const adminAuth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user || user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token.' });
    }
};

// DASHBOARD STATS
router.get('/dashboard/stats', adminAuth, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalOrders = await Order.countDocuments();
        
        // Payment model سے pending payments کی count لیں
        const pendingPayments = await Payment.countDocuments({ status: 'pending' });
        
        // یا پھر Order model میں properly sync کریں
        const pendingOrders = await Order.countDocuments({ paymentStatus: 'pending' });

        const totalRevenue = await Payment.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        // Today's revenue and percentage calculation
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);

        const todayRevenue = await Payment.aggregate([
            { 
                $match: { 
                    status: 'completed',
                    createdAt: { $gte: startOfToday }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const yesterdayRevenue = await Payment.aggregate([
            { 
                $match: { 
                    status: 'completed',
                    createdAt: { 
                        $gte: startOfYesterday,
                        $lt: startOfToday
                    }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        // This week's revenue and percentage calculation
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        
        const startOfLastWeek = new Date(startOfWeek);
        startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

        const thisWeekRevenue = await Payment.aggregate([
            { 
                $match: { 
                    status: 'completed',
                    createdAt: { $gte: startOfWeek }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const lastWeekRevenue = await Payment.aggregate([
            { 
                $match: { 
                    status: 'completed',
                    createdAt: { 
                        $gte: startOfLastWeek,
                        $lt: startOfWeek
                    }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        // This month's revenue and percentage calculation
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);

        const thisMonthRevenue = await Payment.aggregate([
            { 
                $match: { 
                    status: 'completed',
                    createdAt: { $gte: startOfMonth }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const lastMonthRevenue = await Payment.aggregate([
            { 
                $match: { 
                    status: 'completed',
                    createdAt: { 
                        $gte: startOfLastMonth,
                        $lte: endOfLastMonth
                    }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        // Calculate percentage changes
        const calculatePercentageChange = (current, previous) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return ((current - previous) / previous * 100).toFixed(1);
        };

        // Yesterday's pending orders for comparison
        const yesterdayPendingOrders = await Payment.countDocuments({
            status: 'pending',
            createdAt: {
                $gte: startOfYesterday,
                $lt: startOfToday
            }
        });

        // Calculate pending orders change
        const pendingOrdersChange = calculatePercentageChange(pendingPayments, yesterdayPendingOrders);

        const todayTotal = todayRevenue[0]?.total || 0;
        const yesterdayTotal = yesterdayRevenue[0]?.total || 0;
        const todayChange = calculatePercentageChange(todayTotal, yesterdayTotal);

        const weekTotal = thisWeekRevenue[0]?.total || 0;
        const lastWeekTotal = lastWeekRevenue[0]?.total || 0;
        const weekChange = calculatePercentageChange(weekTotal, lastWeekTotal);

        const monthTotal = thisMonthRevenue[0]?.total || 0;
        const lastMonthTotal = lastMonthRevenue[0]?.total || 0;
        const monthChange = calculatePercentageChange(monthTotal, lastMonthTotal);

        const recentActivity = await Order.find()
            .populate({
                path: 'userId',
                select: 'email',
                options: { strictPopulate: false }
            })
            .sort({ createdAt: -1 })
            .limit(10)
            .select('type paymentStatus userId createdAt');

        const formattedActivity = recentActivity.map(activity => ({
            ...activity.toObject(),
            status: activity.paymentStatus || 'pending' // paymentStatus استعمال کریں
        }));

        res.json({
            totalUsers,
            totalOrders,
            pendingOrders: pendingPayments, // Payment model سے pending count
            totalRevenue: totalRevenue[0]?.total || 0,
            recentActivity: formattedActivity,
            pendingOrdersChange: pendingOrdersChange, // NEW
            // Dynamic revenue statistics with percentage changes
            revenueBreakdown: {
                today: {
                    amount: todayTotal,
                    change: todayChange,
                    isPositive: parseFloat(todayChange) >= 0
                },
                thisWeek: {
                    amount: weekTotal,
                    change: weekChange,
                    isPositive: parseFloat(weekChange) >= 0
                },
                thisMonth: {
                    amount: monthTotal,
                    change: monthChange,
                    isPositive: parseFloat(monthChange) >= 0
                }
            }
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

// USER MANAGEMENT
router.get('/users', adminAuth, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query;
        const query = search ? {
            $or: [
                { email: { $regex: search, $options: 'i' } },
                { name: { $regex: search, $options: 'i' } }
            ]
        } : {};

        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const totalUsers = await User.countDocuments(query);

        const usersWithOrderCount = await Promise.all(
            users.map(async (user) => {
                const orderCount = await Order.countDocuments({ userId: user._id });
                return { ...user.toObject(), orderCount };
            })
        );

        res.json({
            users: usersWithOrderCount,
            totalPages: Math.ceil(totalUsers / limit),
            currentPage: page,
            totalUsers
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.put('/users/:userId/block', adminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findByIdAndUpdate(
            userId,
            { isBlocked: true, blockedAt: new Date() },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ message: 'User blocked successfully', user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to block user' });
    }
});

router.put('/users/:userId/unblock', adminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findByIdAndUpdate(
            userId,
            { isBlocked: false, $unset: { blockedAt: 1 } },
            { new: true }
        );

        res.json({ message: 'User unblocked successfully', user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to unblock user' });
    }
});

// GET SINGLE USER DETAILS
router.get('/users/:userId', adminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        
        const user = await User.findById(userId).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get user's orders
        const orders = await Order.find({ userId: userId })
            .populate('payment', 'amount status createdAt')
            .sort({ createdAt: -1 })
            .limit(10);

        // Simplified approach - use string directly
        const totalSpent = await Payment.aggregate([
            { $match: { userId: userId, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const userDetails = {
            ...user.toObject(),
            totalOrders: orders.length,
            totalSpent: totalSpent[0]?.total || 0,
            recentOrders: orders,
            joinedDate: user.createdAt,
            lastLogin: user.lastLogin || 'Never'
        };

        res.json({ user: userDetails });
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ error: 'Failed to fetch user details', details: error.message });
    }
});

// ORDERS MANAGEMENT
// router.get('/orders', adminAuth, async (req, res) => {
//     try {
//         const { page = 1, limit = 20, status = 'all', type = 'all' } = req.query;

//         let query = {};
//         if (status !== 'all') query.status = status;
//         if (type !== 'all') query.type = type;

//         const orders = await Order.find(query);
//         const ordersWithUser = await Order.populate(orders, { path: 'userId', select: 'email name' });
//         const ordersWithPayment = await Order.populate(ordersWithUser, { path: 'payment' });
//         const ordersWithGift = await Order.populate(ordersWithPayment, { path: 'giftId', select: 'type' });

//         const finalOrders = ordersWithGift
//             .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
//             .slice((page - 1) * limit, page * limit);

//         const totalOrders = await Order.countDocuments(query);

//         const formattedOrders = finalOrders.map(order => ({
//             ...order.toObject(),
//             paymentStatus: order.status, // Rename for frontend
//             type: order.type || order.giftId?.type || 'Unknown'
//         }));

//         res.json({
//             orders: formattedOrders,
//             totalPages: Math.ceil(totalOrders / limit),
//             currentPage: page,
//             totalOrders
//         });
//     } catch (error) {
//         console.error('Error fetching orders:', error.message, '\nStack:', error.stack);
//         res.status(500).json({ error: 'Failed to fetch orders', details: error.message });
//     }
// });

router.get('/orders', adminAuth, async (req, res) => {
    try {
        const { page = 1, limit = 20, status = 'all', type = 'all' } = req.query;

        let query = {};
        if (status !== 'all') query.paymentStatus = status;
        if (type !== 'all') query.type = type;

        console.log('Fetching orders with query:', query, 'page:', page, 'limit:', limit);

        // Step 1: Test basic find query
        console.log('Executing Order.find...');
        const orders = await Order.find(query);
        console.log('Order.find completed, found:', orders.length, 'orders');

        // Step 2: Test population individually
        console.log('Populating userId...');
        const ordersWithUser = await Order.populate(orders, { path: 'userId', select: 'email name' });
        console.log('userId population completed');

        console.log('Populating payment...');
        const ordersWithPayment = await Order.populate(ordersWithUser, { path: 'payment' });
        console.log('payment population completed');

        console.log('Populating giftId...');
        const ordersWithGift = await Order.populate(ordersWithPayment, { path: 'giftId', select: 'type' });
        console.log('giftId population completed');

        // Step 3: Apply sorting and pagination
        const finalOrders = ordersWithGift
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice((page - 1) * limit, page * limit);

        const totalOrders = await Order.countDocuments(query);

        // Step 4: Format response
        const formattedOrders = finalOrders.map(order => ({
            ...order.toObject(),
            type: order.type || order.giftId?.type || 'Unknown'
        }));

        console.log('Orders fetched:', formattedOrders.length, 'Total orders:', totalOrders);

        res.json({
            orders: formattedOrders,
            totalPages: Math.ceil(totalOrders / limit),
            currentPage: page,
            totalOrders
        });
    } catch (error) {
        console.error('Error fetching orders:', error.message, '\nStack:', error.stack);
        res.status(500).json({ error: 'Failed to fetch orders', details: error.message });
    }
});

router.get('/orders/:orderId', adminAuth, async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId)
            .populate('userId', 'email name')
            .populate('payment');

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json(order);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch order details' });
    }
});

router.put('/orders/:orderId/status', adminAuth, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        const order = await Order.findByIdAndUpdate(
            orderId,
            {
                paymentStatus: status,
                updatedAt: new Date(),
                ...(status === 'completed' && { completedAt: new Date() })
            },
            { new: true }
        ).populate('userId', 'email name').populate('giftId');

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Update payment status as well if order is completed
        if (status === 'completed' && order.payment) {
            const Payment = mongoose.model('Payment');
            await Payment.findByIdAndUpdate(order.payment, { status: 'completed' });
        }

        // Send gift delivery email when order is completed
        if (status === 'completed' && order.giftId) {
            try {
                console.log('🎯 Order completed, checking for gift email delivery...');
                console.log('Gift ID:', order.giftId);
                
                const Gift = mongoose.model('Gift');
                const gift = await Gift.findById(order.giftId);
                console.log('Gift found:', gift ? 'Yes' : 'No');
                
                if (gift) {
                    console.log('Gift delivery method:', gift.deliveryMethod);
                    console.log('Gift delivery email:', gift.deliveryEmail);
                    
                    if (gift.deliveryMethod === 'email' && gift.deliveryEmail) {
                        console.log('📧 Sending gift email via nodemailer...');
                        
                        // Handle WishKnot gifts differently
                        if (gift.giftType === 'wishknot') {
                            // Import WishKnot model dynamically to avoid circular dependencies
                            const WishKnot = (await import('../models/WishKnot.js')).default;
                            const wishKnot = await WishKnot.findOne({ giftId: gift._id });
                            
                            if (wishKnot) {
                                console.log('🪢 Sending WishKnot email from admin with access token:', wishKnot.accessToken);
                                const result = await nodemailerService.sendWishKnotEmail({
                                    recipientEmail: gift.deliveryEmail,
                                    recipientName: gift.recipientName,
                                    senderName: gift.senderName,
                                    knotType: wishKnot.knotType,
                                    occasion: gift.occasion,
                                    giftId: gift._id,
                                    accessToken: wishKnot.accessToken,
                                    viewUrl: `${process.env.BASE_URL || 'http://127.0.0.1:5500'}/wishknot-view.html?giftId=${gift._id}&token=${wishKnot.accessToken}`,
                                    scheduledRevealDate: wishKnot.scheduledRevealDate
                                });
                                
                                if (result.success) {
                                    console.log('✅ WishKnot email sent from admin successfully:', result.messageId);
                                    await wishKnot.logInteraction('email_sent', { recipientEmail: gift.deliveryEmail });
                                } else {
                                    console.error('❌ Failed to send WishKnot email from admin:', result.error);
                                }
                            } else {
                                console.error('❌ WishKnot record not found for gift:', gift._id);
                            }
                        } else {
                            // Handle regular gifts (non-WishKnot)
                            const result = await nodemailerService.sendGiftEmail(gift);
                            
                            if (result.success) {
                                console.log('✅ Gift delivery email sent successfully:', result.messageId);
                            } else {
                                console.error('❌ Failed to send gift delivery email:', result.error);
                            }
                        }
                    } else {
                        console.log('⚠️ Gift delivery method is not email or no delivery email provided');
                    }
                } else {
                    console.log('❌ Gift not found with ID:', order.giftId);
                }
            } catch (emailError) {
                console.error('💥 Error sending gift delivery email:', emailError);
            }
        }

        res.json({ message: 'Order status updated successfully', order });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});


const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Mock quota limits (replace with your actual plan limits)
const QUOTA_LIMITS = {
    openai: { limit: 1000000, unit: 'tokens' }, // Example: 1M tokens
    elevenlabs: { limit: 100000, unit: 'characters' } // Example: 100K characters
};

// Mock API health check functions (replace with actual API calls if available)
async function checkOpenAIQuotaa() {
    try {
        // Placeholder: OpenAI doesn't provide a direct quota check endpoint
        // Test with a small API call to verify connectivity
        await axios.post('https://api.openai.com/v1/completions', {
            model: 'text-davinci-003',
            prompt: 'Test',
            max_tokens: 1
        }, {
            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
        });
        return { status: 'healthy' };
    } catch (error) {
        console.error('OpenAI health check failed:', error.message);
        return { status: 'error' };
    }
}

async function checkElevenLabsQuotaa() {
    try {
        await axios.get('https://api.elevenlabs.io/v1/voices', {
            headers: { 'xi-api-key': ELEVENLABS_API_KEY }
        });
        return { status: 'healthy' };
    } catch (error) {
        console.error('ElevenLabs health check failed:', error.message);
        return { status: 'error' };
    }
}

async function checkRunwayMLQuotaa() {
    // Placeholder: Implement if you use RunwayML
    return { status: 'healthy' };
}

// API Monitoring Route
router.get('/api-monitoring', async (req, res) => {
    try {
        console.log('Fetching API monitoring data...');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        console.log('Today’s date for query:', today);

        // Fetch ElevenLabs usage
        let elevenlabsUsage = { totalCharacters: 0, totalRequests: 0 };
        try {
            const startUnix = Math.floor(new Date('2025-08-01').getTime() / 1000);
            const endUnix = Math.floor(new Date().getTime() / 1000);
            const response = await axios.get('https://api.elevenlabs.io/v1/usage/character-stats', {
                headers: { 'xi-api-key': ELEVENLABS_API_KEY },
                params: {
                    start_unix: startUnix * 1000,
                    end_unix: endUnix * 1000,
                    aggregation_interval: 'month'
                }
            });
            elevenlabsUsage.totalCharacters = response.data.usage.All.reduce((sum, val) => sum + val, 0);
            elevenlabsUsage.totalRequests = response.data.usage.All.length; // Approximate
        } catch (error) {
            console.error('Error fetching ElevenLabs usage:', error.message);
        }

        // Aggregate APIUsage from database (for OpenAI and historical data)
        const apiUsage = await APIUsage.aggregate([
            { $match: { date: { $gte: today } } },
            {
                $group: {
                    _id: '$provider',
                    totalRequests: { $sum: '$requests' },
                    totalCharacters: { $sum: '$characters' },
                    totalErrors: { $sum: '$errors' },
                    lastUsed: { $max: '$updatedAt' },
                    quotaLimit: { $first: '$quotaLimit' },
                    unit: { $first: '$unit' }
                }
            }
        ]);

        // Merge ElevenLabs real-time data
        const elevenlabsDbUsage = apiUsage.find(u => u._id === 'elevenlabs') || {
            _id: 'elevenlabs',
            totalRequests: 0,
            totalCharacters: 0,
            totalErrors: 0,
            lastUsed: new Date(),
            quotaLimit: QUOTA_LIMITS.elevenlabs.limit,
            unit: QUOTA_LIMITS.elevenlabs.unit
        };
        elevenlabsDbUsage.totalCharacters = elevenlabsUsage.totalCharacters || elevenlabsDbUsage.totalCharacters;
        elevenlabsDbUsage.totalRequests = elevenlabsUsage.totalRequests || elevenlabsDbUsage.totalRequests;

        // Ensure OpenAI and ElevenLabs are in the result
        const defaultUsage = [
            { _id: 'openai', totalRequests: 0, totalCharacters: 0, totalErrors: 0, lastUsed: new Date(), quotaLimit: QUOTA_LIMITS.openai.limit, unit: QUOTA_LIMITS.openai.unit },
            elevenlabsDbUsage
        ];
        const mergedUsage = defaultUsage.map(defaultU => {
            const existing = apiUsage.find(u => u._id === defaultU._id) || defaultU;
            return { ...defaultU, ...existing };
        });

        const recentErrors = await APIUsage.find({
            errors: { $gt: 0 },
            date: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
            .populate('orderId', '_id')
            .sort({ updatedAt: -1 })
            .limit(10);

        const systemHealth = await mongoose.connection.db.admin().ping();
        const apiHealth = {
            openai: await checkOpenAIQuotaa(),
            elevenlabs: await checkElevenLabsQuotaa(),
            runwayml: await checkRunwayMLQuotaa()
        };

        const formattedApiUsage = mergedUsage.map(usage => ({
            provider: usage._id,
            totalRequests: usage.totalRequests,
            totalCharacters: usage.totalCharacters || 0,
            totalErrors: usage.totalErrors,
            lastUsed: usage.lastUsed,
            quotaLimit: usage.quotaLimit,
            unit: usage.unit,
            usagePercentage: usage.unit === 'requests'
                ? ((usage.totalRequests / usage.quotaLimit) * 100).toFixed(2)
                : ((usage.totalCharacters / usage.quotaLimit) * 100).toFixed(2),
            status: apiHealth[usage._id]?.status === 'healthy' ? 'Active' : 'Error'
        }));

        const formattedRecentErrors = recentErrors.map(error => ({
            time: error.updatedAt,
            provider: error.provider,
            errorMessage: error.errors > 0 ? 'API Error' : 'Unknown',
            orderId: error.orderId ? `#ORD${error.orderId._id.slice(-6)}` : 'N/A'
        }));

        res.json({
            apiUsage: formattedApiUsage,
            recentErrors: formattedRecentErrors
        });
    } catch (error) {
        console.error('Error in /api-monitoring:', error.message, '\nStack:', error.stack);
        res.status(500).json({ error: 'Failed to fetch API monitoring data', details: error.message });
    }
});


// // AI API MONITORING
// router.get('/api-monitoring', adminAuth, async (req, res) => {
//     try {
//         console.log('Fetching API monitoring data...');
//         const today = new Date();
//         today.setHours(0, 0, 0, 0);
//         console.log('Today’s date for query:', today);

//         const apiUsage = await APIUsage.aggregate([
//             { $match: { date: { $gte: today } } },
//             {
//                 $group: {
//                     _id: '$provider',
//                     totalRequests: { $sum: '$requests' },
//                     totalCharacters: { $sum: '$characters' },
//                     totalErrors: { $sum: '$errors' },
//                     lastUsed: { $max: '$updatedAt' },
//                     quotaLimit: { $first: '$quotaLimit' },
//                     unit: { $first: '$unit' }
//                 }
//             }
//         ]);

//         const recentErrors = await APIUsage.find({
//             errors: { $gt: 0 },
//             date: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
//         })
//             .populate('orderId', '_id')
//             .sort({ updatedAt: -1 })
//             .limit(10);

//         const systemHealth = await mongoose.connection.db.admin().ping();
//         const apiHealth = {
//             openai: await checkOpenAIQuota(),
//             elevenlabs: await checkElevenLabsQuota(),
//             runwayml: await checkRunwayMLQuota()
//         };

//         const formattedApiUsage = apiUsage.map(usage => ({
//             provider: usage._id,
//             totalRequests: usage.totalRequests,
//             totalCharacters: usage.totalCharacters || 0,
//             totalErrors: usage.totalErrors,
//             lastUsed: usage.lastUsed,
//             quotaLimit: usage.quotaLimit,
//             unit: usage.unit,
//             usagePercentage: usage.unit === 'requests'
//                 ? ((usage.totalRequests / usage.quotaLimit) * 100).toFixed(2)
//                 : ((usage.totalCharacters / usage.quotaLimit) * 100).toFixed(2),
//             status: apiHealth[usage._id]?.status === 'healthy' ? 'Active' : 'Error'
//         }));

//         const formattedRecentErrors = recentErrors.map(error => ({
//             time: error.updatedAt,
//             provider: error.provider,
//             errorMessage: error.errors > 0 ? 'API Error' : 'Unknown',
//             orderId: error.orderId ? `#ORD${error.orderId._id.slice(-6)}` : 'N/A'
//         }));

//         res.json({
//             apiUsage: formattedApiUsage,
//             recentErrors: formattedRecentErrors
//         });
//     } catch (error) {
//         console.error('Error in /api-monitoring:', error.message, '\nStack:', error.stack);
//         res.status(500).json({ error: 'Failed to fetch API monitoring data', details: error.message });
//     }
// });

// PAYMENTS & INVOICES
router.get('/payments', adminAuth, async (req, res) => {
    try {
        console.log('Fetching payments with query:', req.query);
        const { page = 1, limit = 20, status = 'all' } = req.query;

        let query = {};
        if (status !== 'all') query.status = status;
        console.log('Query filter:', query);

        // Try-catch blocks for each database operation to identify where the error occurs
        let payments;
        try {
            payments = await Payment.find(query)
                .populate('order', 'type')
                .populate('userId', 'email name')
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit);
            console.log(`Found ${payments.length} payments`);
        } catch (dbError) {
            console.error('Error in Payment.find():', dbError);
            return res.status(500).json({ error: 'Database query failed', details: dbError.message });
        }

        let totalPayments;
        try {
            totalPayments = await Payment.countDocuments(query);
            console.log(`Total payments count: ${totalPayments}`);
        } catch (countError) {
            console.error('Error in countDocuments():', countError);
            return res.status(500).json({ error: 'Count query failed', details: countError.message });
        }

        let revenueStats;
        try {
            revenueStats = await Payment.aggregate([
                { $match: { status: 'completed' } },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' },
                            day: { $dayOfMonth: '$createdAt' }
                        },
                        dailyRevenue: { $sum: '$amount' },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { '_id.year': -1, '_id.month': -1, '_id.day': -1 } },
                { $limit: 30 }
            ]);
            console.log(`Revenue stats calculated: ${revenueStats.length} entries`);
        } catch (aggregateError) {
            console.error('Error in aggregate():', aggregateError);
            return res.status(500).json({ error: 'Aggregate query failed', details: aggregateError.message });
        }

        res.json({
            payments,
            totalPages: Math.ceil(totalPayments / limit),
            currentPage: page,
            totalPayments,
            revenueStats
        });
    } catch (error) {
        console.error('Unhandled error in /payments route:', error);
        res.status(500).json({ error: 'Failed to fetch payments data', details: error.message });
    }
});

// Invoice Generation Endpoint
router.get('/payments/:paymentId/invoice', adminAuth, async (req, res) => {
    try {
        const { paymentId } = req.params;
        
        const payment = await Payment.findById(paymentId)
            .populate('order')
            .populate('userId', 'email name');
            
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        // Generate PDF invoice using a library like puppeteer or jsPDF
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument();
        
        // Set response headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice_${paymentId}.pdf`);
        
        // Pipe PDF to response
        doc.pipe(res);
        
        // Add invoice content
        doc.fontSize(20).text('INVOICE', 50, 50);
        doc.fontSize(12)
           .text(`Invoice ID: INV-${payment._id}`, 50, 100)
           .text(`Payment ID: ${payment._id}`, 50, 120)
           .text(`Date: ${new Date(payment.createdAt).toLocaleDateString()}`, 50, 140)
           .text(`Amount: $${payment.amount.toFixed(2)}`, 50, 160)
           .text(`Status: ${payment.status}`, 50, 180)
           .text(`Method: ${payment.method}`, 50, 200);
           
        if (payment.userId) {
            doc.text(`Customer: ${payment.userId.email}`, 50, 220);
        }
        
        doc.end();
        
    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).json({ error: 'Failed to generate invoice' });
    }
});

// Refund Endpoint
router.post('/payments/:paymentId/refund', adminAuth, async (req, res) => {
    try {
        const { paymentId } = req.params;
        
        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        
        if (payment.status !== 'completed') {
            return res.status(400).json({ error: 'Only completed payments can be refunded' });
        }
        
        // Process refund through Stripe
        if (payment.stripeSessionId) {
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            
            // Get the payment intent from the session
            const session = await stripe.checkout.sessions.retrieve(payment.stripeSessionId);
            const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
            
            // Create refund
            const refund = await stripe.refunds.create({
                payment_intent: paymentIntent.id,
                amount: Math.round(payment.amount * 100), // Convert to cents
            });
            
            // Update payment status
            payment.status = 'refunded';
            payment.refundedAt = new Date();
            payment.refundId = refund.id;
            await payment.save();
            
            // Update order status
            if (payment.order) {
                await Order.findByIdAndUpdate(payment.order, {
                    paymentStatus: 'refunded'
                });
            }
            
            res.json({ 
                message: 'Refund processed successfully',
                refundId: refund.id,
                amount: payment.amount
            });
        } else {
            res.status(400).json({ error: 'Cannot process refund for this payment method' });
        }
        
    } catch (error) {
        console.error('Error processing refund:', error);
        res.status(500).json({ error: 'Failed to process refund' });
    }
});

// CONTENT CONTROL
router.get('/content/:section', adminAuth, async (req, res) => {
    try {
        const { section } = req.params;
        const content = await SiteContent.findOne({ section });

        if (!content) {
            return res.status(404).json({ error: 'Content section not found' });
        }

        res.json(content);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch content' });
    }
});

router.put('/content/:section', adminAuth, async (req, res) => {
    try {
        const { section } = req.params;
        const updateData = req.body;

        const content = await SiteContent.findOneAndUpdate(
            { section },
            {
                ...updateData,
                updatedAt: new Date(),
                updatedBy: req.user._id
            },
            { new: true, upsert: true }
        );

        res.json({ message: 'Content updated successfully', content });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update content' });
    }
});

// EMAIL TEMPLATES
// TEMPORARY DEBUG ROUTE - Remove after fixing
router.get('/debug-email-templates', async (req, res) => {
    try {
        console.log('=== DEBUG EMAIL TEMPLATES ===');
        console.log('MongoDB connection state:', mongoose.connection.readyState);
        
        // Test direct model access
        const directTemplates = await EmailTemplate.find();
        console.log('Direct model query result:', directTemplates.length, 'templates found');
        
        // Test service
        const serviceResult = await emailTemplateService.getAllTemplates();
        console.log('Service result:', serviceResult);
        
        res.json({
            connectionState: mongoose.connection.readyState,
            directCount: directTemplates.length,
            directTemplates: directTemplates,
            serviceResult: serviceResult
        });
    } catch (error) {
        console.error('Debug route error:', error);
        res.status(500).json({ 
            error: error.message,
            stack: error.stack,
            connectionState: mongoose.connection.readyState
        });
    }
});



// EMAIL SETTINGS ROUTE
router.get('/api/email/settings', adminAuth, async (req, res) => {
    try {
        const emailSettings = {
            smtpHost: process.env.GMAIL_HOST || 'smtp.gmail.com',
            smtpPort: process.env.GMAIL_PORT || 587,
            fromEmail: process.env.GMAIL_USER || '',
            configured: !!(process.env.GMAIL_USER && process.env.GMAIL_PASS)
        };
        res.json(emailSettings);
    } catch (error) {
        console.error('Error fetching email settings:', error);
        res.status(500).json({ error: 'Failed to fetch email settings' });
    }
});

// EMAIL TEMPLATE ROUTES
router.get('/email-templates', adminAuth, async (req, res) => {
    try {
        const templates = await emailTemplateService.getAllTemplates();
        res.json(templates);
    } catch (error) {
        console.error('Error fetching email templates:', error);
        res.status(500).json({ error: 'Failed to fetch email templates' });
    }
});

router.get('/email-templates/:templateId', adminAuth, async (req, res) => {
    try {
        const template = await emailTemplateService.getTemplateById(req.params.templateId);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }
        res.json(template);
    } catch (error) {
        console.error('Error fetching email template:', error);
        res.status(500).json({ error: 'Failed to fetch email template' });
    }
});

router.post('/email-templates', adminAuth, async (req, res) => {
    try {
        const template = await emailTemplateService.createTemplate(req.body);
        res.status(201).json({ message: 'Template created successfully', template });
    } catch (error) {
        console.error('Error creating email template:', error);
        res.status(500).json({ error: 'Failed to create email template' });
    }
});

router.put('/email-templates/:templateId', adminAuth, async (req, res) => {
    try {
        const template = await emailTemplateService.updateTemplate(req.params.templateId, req.body);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }
        res.json({ message: 'Template updated successfully', template });
    } catch (error) {
        console.error('Error updating email template:', error);
        res.status(500).json({ error: 'Failed to update email template' });
    }
});

router.delete('/email-templates/:templateId', adminAuth, async (req, res) => {
    try {
        const template = await emailTemplateService.deleteTemplate(req.params.templateId);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }
        res.json({ message: 'Template deleted successfully' });
    } catch (error) {
        console.error('Error deleting email template:', error);
        res.status(500).json({ error: 'Failed to delete email template' });
    }
});

// SYSTEM HEALTH
// ...existing code ...

// ANALYTICS & REPORTS
router.get('/analytics', adminAuth, async (req, res) => {
    try {
        const { period = '30days' } = req.query;
        
        // Calculate date range based on period
        let startDate = new Date();
        switch (period) {
            case '7days':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case '30days':
                startDate.setDate(startDate.getDate() - 30);
                break;
            case '90days':
                startDate.setDate(startDate.getDate() - 90);
                break;
            case '1year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            default:
                startDate.setDate(startDate.getDate() - 30);
        }

        // Gift type statistics from Orders
        const giftTypeStats = await Order.aggregate([
            { $match: { createdAt: { $gte: startDate } } },
            { $group: { _id: '$type', count: { $sum: 1 } } }
        ]);

        // Occasion statistics from Gift model
        const occasionStats = await GiftTemplate.aggregate([
            { $match: { createdAt: { $gte: startDate } } },
            { $group: { _id: '$occasion', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // Revenue breakdown by gift type
        const revenueByType = await Order.aggregate([
            { 
                $match: { 
                    createdAt: { $gte: startDate },
                    paymentStatus: 'completed'
                } 
            },
            { $group: { _id: '$type', revenue: { $sum: '$price' } } }
        ]);

        // User growth statistics
        const userGrowth = await User.aggregate([
            { $match: { createdAt: { $gte: startDate } } },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
        ]);

        // Order completion rate
        const totalOrders = await Order.countDocuments({ createdAt: { $gte: startDate } });
        const completedOrders = await Order.countDocuments({ 
            createdAt: { $gte: startDate },
            paymentStatus: 'completed'
        });

        const completionRate = totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(2) : 0;

        // Total revenue
        const totalRevenue = await Payment.aggregate([
            { 
                $match: { 
                    createdAt: { $gte: startDate },
                    status: 'completed'
                } 
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        res.json({
            period,
            giftTypeStats,
            occasionStats,
            revenueByType,
            userGrowth,
            totalOrders,
            completedOrders,
            completionRate: parseFloat(completionRate),
            totalRevenue: totalRevenue[0]?.total || 0,
            dateRange: {
                start: startDate,
                end: new Date()
            }
        });

    } catch (error) {
        console.error('Error fetching analytics data:', error);
        res.status(500).json({ error: 'Failed to fetch analytics data' });
    }
});

// SYSTEM HEALTH
router.get('/system/health', adminAuth, async (req, res) => {
    try {
        console.log('Fetching system health data...');
        
        // Check database connection
        let dbStatus = 'unhealthy';
        try {
            await mongoose.connection.db.admin().ping();
            dbStatus = 'healthy';
        } catch (dbError) {
            console.error('Database health check failed:', dbError);
        }

        // Check API health
        const apiHealth = {
            openai: await checkOpenAIQuota(),
            elevenlabs: await checkElevenLabsQuota(),
            runwayml: await checkRunwayMLQuota()
        };

        // Get server metrics
        const serverMetrics = {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            nodeVersion: process.version,
            platform: process.platform
        };

        const healthData = {
            database: dbStatus,
            apis: apiHealth,
            server: serverMetrics,
            timestamp: new Date(),
            status: 'ok'
        };

        console.log('System health data prepared:', healthData);
        res.json(healthData);

    } catch (error) {
        console.error('Error fetching system health:', error);
        res.status(500).json({ 
            error: 'Failed to fetch system health',
            database: 'error',
            apis: {
                openai: { status: 'error', error: 'Health check failed' },
                elevenlabs: { status: 'error', error: 'Health check failed' },
                runwayml: { status: 'error', error: 'Health check failed' }
            },
            server: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            },
            timestamp: new Date()
        });
    }
});

// Helper functions
async function sendOrderCompletionEmail(order) {
    try {
        const mailgun = require('mailgun-js')({
            apiKey: process.env.MAILGUN_API_KEY,
            domain: process.env.MAILGUN_DOMAIN
        });

        const template = await EmailTemplate.findOne({ slug: 'order_completion' });
        if (!template) return;

        const emailContent = template.content
            .replace('{{customer_name}}', order.userId.name || order.userId.email)
            .replace('{{gift_type}}', order.type)
            .replace('{{gift_link}}', `${process.env.FRONTEND_URL}/gift/${order._id}`);

        const data = {
            from: 'Wispwish <noreply@wispwish.com>',
            to: order.userId.email,
            subject: template.subject,
            html: emailContent
        };

        await mailgun.messages().send(data);
    } catch (error) {
        console.error('Failed to send completion email:', error);
    }
}

// VOICE STYLES MANAGEMENT (Admin)
router.get('/voice-styles', adminAuth, async (req, res) => {
    try {
        const styles = await VoiceStyle.find().sort({ isDefault: -1, createdAt: -1 });
        res.json(styles);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch voice styles' });
    }
});

router.post('/voice-styles', adminAuth, async (req, res) => {
    try {
        const { name, provider = 'elevenlabs', voiceId, gender = 'unknown', accent = '', isDefault = false, previewUrl = '' } = req.body;
        if (!name || !voiceId) return res.status(400).json({ error: 'name and voiceId are required' });

        if (isDefault) {
            await VoiceStyle.updateMany({ isDefault: true }, { $set: { isDefault: false } });
        }

        const style = await VoiceStyle.create({ name, provider, voiceId, gender, accent, isDefault, previewUrl });
        res.status(201).json(style);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create voice style' });
    }
});

// Update voice style (including toggling isActive)
router.patch('/voice-styles/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const voiceStyle = await VoiceStyle.findByIdAndUpdate(id, updates, { new: true });
        if (!voiceStyle) {
            return res.status(404).json({ error: 'Voice style not found' });
        }
        res.json(voiceStyle);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update voice style' });
    }
});

router.delete('/voice-styles/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await VoiceStyle.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ error: 'Voice style not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete voice style' });
    }
});

router.post('/voice-styles/:id/set-default', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const style = await VoiceStyle.findById(id);
        if (!style) return res.status(404).json({ error: 'Voice style not found' });
        await VoiceStyle.updateMany({ isDefault: true }, { $set: { isDefault: false } });
        style.isDefault = true;
        await style.save();
        res.json(style);
    } catch (error) {
        res.status(500).json({ error: 'Failed to set default voice style' });
    }
});

router.post('/voice-styles/:id/set-active', adminAuth, async (req, res) => {
    try {
        await VoiceStyle.updateMany({}, { isActive: false });
        const updated = await VoiceStyle.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to set active' });
    }
});

async function checkOpenAIQuota() {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return { status: 'error', error: 'API key not configured' };
        }

        // Simple health check - just verify the key format
        const apiKey = process.env.OPENAI_API_KEY;
        if (apiKey.startsWith('sk-') && apiKey.length > 20) {
            return {
                status: 'healthy',
                usage: {
                    requestsUsed: 0,
                    quotaLimit: 10000
                },
                lastChecked: new Date()
            };
        } else {
            return { status: 'error', error: 'Invalid API key format' };
        }
    } catch (error) {
        console.error('OpenAI health check error:', error);
        return { status: 'error', error: error.message };
    }
}

async function checkElevenLabsQuota() {
    try {
        if (!process.env.ELEVENLABS_API_KEY) {
            return { status: 'error', error: 'API key not configured' };
        }

        // Simple health check
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (apiKey.length > 10) {
            return {
                status: 'healthy',
                usage: {
                    charactersUsed: 0,
                    quotaLimit: 10000
                },
                lastChecked: new Date()
            };
        } else {
            return { status: 'error', error: 'Invalid API key format' };
        }
    } catch (error) {
        console.error('ElevenLabs health check error:', error);
        return { status: 'error', error: error.message };
    }
}

async function checkRunwayMLQuota() {
    try {
        if (!process.env.RUNWAYML_API_KEY) {
            return { status: 'error', error: 'API key not configured' };
        }

        // Simple health check
        const apiKey = process.env.RUNWAYML_API_KEY;
        if (apiKey.length > 10) {
            return {
                status: 'healthy',
                usage: {
                    requestsUsed: 0,
                    quotaLimit: 1000
                },
                lastChecked: new Date()
            };
        } else {
            return { status: 'error', error: 'Invalid API key format' };
        }
    } catch (error) {
        console.error('RunwayML health check error:', error);
        return { status: 'error', error: error.message };
    }
}

export default router;