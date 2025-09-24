import express from 'express';
import validator from 'validator';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import nodemailerService from '../services/nodemailerService.js';

const router = express.Router();

// REGISTER - COMMENTED OUT (Login functionality disabled temporarily)
router.post('/register', async (req, res) => {
    // Return a temporary response since login/register functionality is disabled
    return res.status(200).json({ 
        success: true, 
        message: 'Registration functionality is temporarily disabled',
        user: {
            id: '123456789',
            name: 'Test User',
            email: 'test@example.com',
            role: 'customer',
            isEmailVerified: true,
            createdAt: new Date(),
        },
        token: 'dummy-token-123456789',
    });
    
    /* Original code commented out
    console.log('POST /api/auth/register received:', req.body);
    try {
        const { name, email, password, confirmPassword, role } = req.body;

        // Field validation
        if (!name || !email || !password || !confirmPassword || !role) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        if (!validator.isEmail(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email format' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match' });
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
        }

        const validRoles = ['customer', 'creator', 'business', 'admin'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ success: false, message: 'Invalid role selected' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'Email already registered' });
        }

        const emailVerificationToken = Math.random().toString(36).substring(2, 15);
        const newUser = new User({ name, email, password, role, emailVerificationToken });

        const token = newUser.generateAuthToken();
        newUser.authToken = token;
        await newUser.save();

        // Send welcome email using Nodemailer
        try {
            const emailResult = await nodemailerService.sendWelcomeEmail(email, name);
            if (emailResult.success) {
                console.log('Welcome email sent successfully:', emailResult.messageId);
            } else {
                console.error('Failed to send welcome email:', emailResult.error);
            }
        } catch (emailError) {
            console.error('Welcome email error:', emailError);
        }

        console.log('User registered:', { id: newUser._id, email, role, token });
        res.status(201).json({
            success: true,
            message: 'Registered successfully. Welcome email sent!',
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                isEmailVerified: newUser.isEmailVerified,
                createdAt: newUser.createdAt,
            },
            token,
        });
    } catch (error) {
        console.error('Registration Error:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
    */
});

// LOGIN - COMMENTED OUT (Login functionality disabled temporarily)
router.post('/login', async (req, res) => {
    // Return a temporary response since login functionality is disabled
    // return res.status(200).json({
    //     success: true,
    //     message: 'Login functionality is temporarily disabled',
    //     user: {
    //         id: '123456789',
    //         name: 'Test User',
    //         email: 'test@example.com',
    //         role: 'customer',
    //         isEmailVerified: true,
    //         lastLogin: new Date(),
    //     },
    //     token: 'dummy-token-123456789',
    // });
    
    // Original code commented out
    console.log('POST /api/auth/login received:', req.body);
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const user = await User.findOne({ email }).select('+password');
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        user.lastLogin = new Date();
        await user.save();

        const token = user.generateAuthToken();

        console.log('User logged in:', { id: user._id, email, role: user.role, token });
        res.status(200).json({
            success: true,
            message: 'Login successful',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isEmailVerified: user.isEmailVerified,
                lastLogin: user.lastLogin,
            },
            token,
        });
    } catch (error) {
        console.error('Login Error:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
    
});

// FORGOT PASSWORD
router.post('/forgot-password', async (req, res) => {
    console.log('POST /api/auth/forgot-password received:', req.body);
    try {
        const { email } = req.body;

        if (!email || !validator.isEmail(email)) {
            return res.status(400).json({ success: false, message: 'Valid email is required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: 'Email not found' });
        }

        const resetToken = Math.random().toString(36).substring(2, 15);
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        console.log(`Password reset token for ${email}: ${resetToken}`);
        res.status(200).json({
            success: true,
            message: 'Password reset link sent to your email'
        });
    } catch (error) {
        console.error('Forgot Password Error:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
});

// GET USER PROFILE
router.get('/me', authenticateToken, (req, res) => {
    res.json({ success: true, user: req.user });
});

export default router;