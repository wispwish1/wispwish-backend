import express from 'express';
import chatService from '../services/chatService.js';

const router = express.Router();

// Store for active threads (in production, use Redis or database)
const activeThreads = new Map();

// Initialize a new chat session
router.post('/init', async (req, res) => {
    try {
        const threadId = await chatService.createThread();

        // Store thread creation time for cleanup
        activeThreads.set(threadId, {
            createdAt: new Date(),
            lastActivity: new Date()
        });

        res.json({
            success: true,
            threadId,
            welcomeMessage: "👋 Hi there! I'm your WispWish assistant. I can help you learn about our AI-powered gifts, pricing, how it works, and more. What would you like to know?"
        });
    } catch (error) {
        console.error('Error initializing chat:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initialize chat session'
        });
    }
});

// Send a message and get response
router.post('/message', async (req, res) => {
    try {
        let { threadId, message } = req.body;

        if (!message || typeof message !== 'string' || message.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }

        // Create new thread if not provided
        if (!threadId) {
            threadId = await chatService.createThread();
            activeThreads.set(threadId, {
                createdAt: new Date(),
                lastActivity: new Date()
            });
        }

        // Update last activity
        if (activeThreads.has(threadId)) {
            activeThreads.get(threadId).lastActivity = new Date();
        }

        // Get response from assistant
        const response = await chatService.sendMessage(threadId, message.trim());

        // Generate suggestions based on the conversation
        const suggestions = generateSuggestions(message);

        res.json({
            success: true,
            threadId,
            response,
            suggestions
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get response. Please try again.',
            fallbackResponse: "I'm having a bit of trouble right now. For immediate help, please visit our FAQ page or contact support!"
        });
    }
});

// Health check endpoint
router.get('/health', async (req, res) => {
    try {
        const status = chatService.getStatus();
        res.json({
            status: 'ok',
            assistant: status.initialized ? 'ready' : 'initializing',
            details: status
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Helper function to generate contextual suggestions
function generateSuggestions(lastMessage) {
    const message = lastMessage.toLowerCase();

    if (message.includes('price') || message.includes('cost') || message.includes('how much')) {
        return ['What gift types are available?', 'Tell me about subscriptions', 'What is Pay What You Want?'];
    }

    if (message.includes('gift') && message.includes('type')) {
        return ['How much do gifts cost?', 'What is a WishKnot?', 'How do I create a gift?'];
    }

    if (message.includes('wishknot') || message.includes('wish knot')) {
        return ['How much is a WishKnot?', 'Other gift types', 'How does delivery work?'];
    }

    if (message.includes('deliver') || message.includes('send') || message.includes('share')) {
        return ['How long does it take?', 'Can I schedule delivery?', 'Do gifts expire?'];
    }

    if (message.includes('subscription') || message.includes('plan')) {
        return ['Monthly vs Weekly plan?', 'Can I cancel anytime?', 'What gift types are included?'];
    }

    // Default suggestions
    return ['What gift types are available?', 'How much does it cost?', 'How does it work?'];
}

// Cleanup old threads periodically (every hour)
setInterval(() => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [threadId, data] of activeThreads.entries()) {
        if (data.lastActivity < oneHourAgo) {
            activeThreads.delete(threadId);
        }
    }
}, 60 * 60 * 1000);

export default router;
