import mongoose from 'mongoose';
import EmailTemplate from '../models/EmailTemplate.js';
import dotenv from 'dotenv';

dotenv.config();

const defaultTemplates = [
    {
        name: 'Welcome Email',
        slug: 'welcome',
        subject: 'Welcome to {{siteName}}!',
        content: '<h1>Welcome {{userName}}!</h1><p>Thank you for joining {{siteName}}. We\'re excited to have you on board!</p><p>Best regards,<br>The {{siteName}} Team</p>',
        variables: ['userName', 'siteName']
    },
    {
        name: 'Order Confirmation',
        slug: 'order-confirmation',
        subject: 'Order Confirmation - {{orderNumber}}',
        content: '<h1>Order Confirmed!</h1><p>Hi {{userName}},</p><p>Your order {{orderNumber}} has been confirmed.</p><p>Total Amount: ${{totalAmount}}</p><p>Thank you for your purchase!</p>',
        variables: ['userName', 'orderNumber', 'totalAmount']
    },
    {
        name: 'Password Reset',
        slug: 'password-reset',
        subject: 'Reset Your Password',
        content: '<h1>Password Reset Request</h1><p>Hi {{userName}},</p><p>Click the link below to reset your password:</p><a href="{{resetLink}}">Reset Password</a><p>If you didn\'t request this, please ignore this email.</p>',
        variables: ['userName', 'resetLink']
    }
];

async function createDefaultTemplates() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        for (const template of defaultTemplates) {
            const existing = await EmailTemplate.findOne({ slug: template.slug });
            if (!existing) {
                await EmailTemplate.create(template);
                console.log(`Created template: ${template.name}`);
            } else {
                console.log(`Template already exists: ${template.name}`);
            }
        }

        console.log('Default templates setup complete!');
        process.exit(0);
    } catch (error) {
        console.error('Error creating templates:', error);
        process.exit(1);
    }
}

createDefaultTemplates();