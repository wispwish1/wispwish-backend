import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import nodemailer from "nodemailer";
import path from 'path';
import cookieParser from 'cookie-parser';
import { connectDB } from './config/db.js';
import admin from './routes/adminRoutes.js';
import giftRoutes from './routes/gift.js';
import paymentRoutes from './routes/payment.js';
import giftTypesRouter, { initializeGiftTypes } from './routes/giftTypes.js';
import artworkRouter from './routes/artWork.js';
import songRoutes from './routes/song.js';
import authRoutes from './routes/authRoutes.js';
import contentRoutes from './routes/contentRoutes.js';
import wishknotRoutes from './routes/wishknot.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import scheduledDeliveryService from './services/scheduledDeliveryService.js';
// import subscriptionFulfillmentService from './services/subscriptionFulfillmentService.js';

const app = express();

// Middleware

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://127.0.0.1:5501', 'https://wispwish.com', 'https://www.wispwish.com'],
  credentials: true,
}));


// IMPORTANT: Webhook route MUST be before express.json() middleware
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(cookieParser());
app.use(express.static('frontend'));
app.use(express.static('.'));  // Serve root directory files

// Connect to DB and initialize data
const initializeApp = async () => {
  try {
    await connectDB();
    await initializeGiftTypes();
    console.log('✅ App initialized successfully');
  } catch (error) {
    console.error('❌ App initialization failed:', error);
    process.exit(1);
  }
};

initializeApp();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', admin);
app.use('/api/gift', giftRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/gift-types', giftTypesRouter);
app.use('/api/artwork', artworkRouter);
app.use('/api/song', songRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/wishknot', wishknotRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/chat', chatRoutes);

// Serve frontend routes
app.get(['/', '/generator.html', '/wishknot.html', '/pricing.html', '/how-it-works.html', '/login.html'], (req, res) => {
  res.sendFile('index.html', { root: 'frontend' });
});

// Serve video player
app.get('/video-player.html', (req, res) => {
  res.sendFile(path.resolve('../video-player.html'));
});

// Serve WishKnot viewer
app.get('/wishknot-view.html', (req, res) => {
  res.sendFile(path.resolve('../wishknot-view.html'));
});

// Email Route
app.post("/send-email", async (req, res) => {
  const { name, email, subject, message, category, priority } = req.body;

  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS    // 🔹 use Gmail App Password (not normal password)
      }
    });

    // Email content
    const mailOptions = {
      from: email,
      // to: "yourgmail@gmail.com", // 🔹 your receiving address
      to: process.env.EMAIL_USER,
      subject: `New Contact Message from ${name} - ${subject}`,
      html: `
        <h3>New Message from Wispwish Contact Form</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Category:</strong> ${category}</p>
        <p><strong>Priority:</strong> ${priority}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `
    };

    // Send Email
    await transporter.sendMail(mailOptions);

    res.json({ success: true });
  } catch (error) {
    console.error("Error sending email:", error);
    res.json({ success: false, error });
  }
});

// Start Server
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Scheduled delivery service automatically starts
  scheduledDeliveryService.start();
  // subscriptionFulfillmentService.start();
});
