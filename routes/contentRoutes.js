import express from 'express';
import Content from '../models/Content.js';

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


// Get all content settings
router.get('/all', adminAuth, async (req, res) => {
    try {
        const content = await Content.findOne() || {
            homepage: {
                heroHeadline: 'Gifts born from the heart, delivered in seconds.',
                heroSubheadline: 'You bring the feeling. We turn it into a gift.',
                metaDescription: 'Create and share AI-generated digital gifts with Wispwish'
            },
            aboutUs: {
                content: ''
            },
            theme: {
                primaryColor: '#667eea',
                secondaryColor: '#764ba2',
                accentColor: '#f093fb'
            },
            moderation: {
                autoModeration: false,
                restrictedWords: []
            }
        };
        res.json(content);
    } catch (error) {
        console.error('Error fetching content:', error);
        res.status(500).json({ error: 'Failed to fetch content' });
    }
});

// Update homepage content
router.put('/homepage', adminAuth, async (req, res) => {
    try {   
        const { heroHeadline, heroSubheadline, metaDescription } = req.body;
        
        if (!heroHeadline || !heroSubheadline || !metaDescription) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        let content = await Content.findOne();
        if (!content) {
            content = new Content();
        }

        content.homepage = {
            heroHeadline,
            heroSubheadline,
            metaDescription
        };

        await content.save();
        res.json({ success: true, message: 'Homepage content updated successfully' });
    } catch (error) {
        console.error('Error updating homepage content:', error);
        res.status(500).json({ error: 'Failed to update homepage content' });
    }
});

// Update theme settings
router.put('/theme',adminAuth, async (req, res) => {
    try {
        const { primaryColor, secondaryColor, accentColor } = req.body;
        
        if (!primaryColor || !secondaryColor || !accentColor) {
            return res.status(400).json({ error: 'All color fields are required' });
        }

        let content = await Content.findOne();
        if (!content) {
            content = new Content();
        }

        content.theme = {
            primaryColor,
            secondaryColor,
            accentColor
        };

        await content.save();
        res.json({ success: true, message: 'Theme updated successfully' });
    } catch (error) {
        console.error('Error updating theme:', error);
        res.status(500).json({ error: 'Failed to update theme' });
    }
});

// Update About Us content
router.put('/about', adminAuth, async (req, res) => {
    try {
        const { content: aboutUsContent } = req.body;
        
        if (!aboutUsContent) {
            return res.status(400).json({ error: 'Content is required' });
        }

        let content = await Content.findOne();
        if (!content) {
            content = new Content();
        }

        content.aboutUs = { content: aboutUsContent };
        await content.save();
        res.json({ success: true, message: 'About Us content updated successfully' });
    } catch (error) {
        console.error('Error updating About Us content:', error);
        res.status(500).json({ error: 'Failed to update About Us content' });
    }
});

// Update moderation settings
router.patch('/moderation', adminAuth, async (req, res) => {
    try {
        const { autoModeration, restrictedWords } = req.body;
        
        if (autoModeration === undefined || !Array.isArray(restrictedWords)) {
            return res.status(400).json({ error: 'Invalid moderation settings' });
        }

        let content = await Content.findOne();
        if (!content) {
            content = new Content();
        }

        content.moderation = {
            autoModeration,
            restrictedWords: restrictedWords.filter(word => word.trim() !== '')
        };

        await content.save();
        res.json({ success: true, message: 'Moderation settings updated successfully' });
    } catch (error) {
        console.error('Error updating moderation settings:', error);
        res.status(500).json({ error: 'Failed to update moderation settings' });
    }
});

export default router;