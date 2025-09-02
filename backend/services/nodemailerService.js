import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import validator from 'validator';

/**
 * Create Nodemailer transporter
 */
const createTransporter = () => {
    if (process.env.NODE_ENV === 'development') {
        return {
            sendMail: async (mailOptions) => {
                console.log('📧 EMAIL CONTENT:', {
                    to: mailOptions.to,
                    subject: mailOptions.subject,
                    html: mailOptions.html.substring(0, 200) + '...',
                    attachments: mailOptions.attachments ? mailOptions.attachments.map(a => a.filename) : []
                });
                return { success: true, messageId: 'debug-' + Date.now() };
            }
        };
    }

    return nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER || 'trickyboy467@gmail.com',
            pass: process.env.EMAIL_PASS || 'vbjo vrbc jxvs pihv'
        }
    });
};

/**
 * Helper function to validate URLs
 */
const validateUrl = (url) => {
    return validator.isURL(url, { protocols: ['http', 'https'], require_protocol: true });
};

/**
 * Helper function to download and prepare attachment
 */
const prepareAttachment = async (url, filename, contentType, cid = null) => {
    try {
        if (!validateUrl(url)) {
            console.error(`❌ Invalid URL for attachment: ${url}`);
            return null;
        }

        console.log(`📥 Downloading attachment from: ${url}`);
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15000
        });
        
        const buffer = Buffer.from(response.data);
        if (buffer.length === 0) {
            console.error(`❌ Downloaded file is empty: ${url}`);
            return null;
        }
        console.log(`✅ Successfully downloaded: ${filename} (${buffer.length} bytes)`);
        
        return {
            filename,
            content: buffer,
            contentType: contentType || response.headers['content-type'] || 'application/octet-stream',
            ...(cid && { cid })
        };
    } catch (error) {
        console.error(`❌ Error downloading attachment from ${url}: ${error.message}, Status: ${error.response?.status}`);
        return null;
    }
};

/**
 * Send Welcome Email when user registers
 */
const sendWelcomeEmail = async (userEmail, userName) => {
    try {
        const transporter = createTransporter();
        
        const mailOptions = {
            from: `${process.env.FROM_NAME || 'Wispwish Team'} <${process.env.FROM_EMAIL || 'trickyboy467@gmail.com'}>`,
            to: userEmail,
            subject: '🎉 Welcome to Wispwish - Create Magical Gifts!',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Wispwish! 🎁</h1>
                    </div>
                    
                    <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <h2 style="color: #333; margin-top: 0;">Hi ${userName || 'Friend'}! 👋</h2>
                        
                        <p style="color: #666; font-size: 16px; line-height: 1.6;">
                            Welcome to Wispwish - where every gift tells a story! We're thrilled to have you join our community of gift creators.
                        </p>
                        
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="color: #333; margin-top: 0;">🌟 What you can create:</h3>
                            <ul style="color: #666; line-height: 1.8;">
                                <li>📝 <strong>Personalized Poems</strong> - AI-crafted verses for any occasion</li>
                                <li>🎵 <strong>Voice Messages</strong> - Heartfelt audio messages with AI voices</li>
                                <li>🎨 <strong>Custom Illustrations</strong> - Beautiful artwork tailored to your story</li>
                                <li>🎬 <strong>Video Messages</strong> - Dynamic visual stories</li>
                            </ul>
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="http://127.0.0.1:5500/Frontend/generator.html" 
                               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                      color: white; 
                                      padding: 15px 30px; 
                                      text-decoration: none; 
                                      border-radius: 25px; 
                                      font-weight: bold; 
                                      display: inline-block;">
                                🎁 Create Your First Gift
                            </a>
                        </div>
                        
                        <p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px;">
                            Need help? Reply to this email or visit our support center.<br>
                            Happy gift creating! ✨
                        </p>
                    </div>
                </div>
            `
        };

        const result = await transporter.sendMail(mailOptions);
        console.log('✅ Welcome email sent successfully:', result.messageId);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('❌ Error sending welcome email:', error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Send Order Confirmation Email after payment
 */
const sendOrderConfirmation = async (userEmail, orderData) => {
    try {
        const transporter = createTransporter();
        let attachments = [];
        
        console.log(`📧 Preparing order confirmation for ${userEmail}, giftType: ${orderData.giftType}`);

        // Handle image attachments for image gifts
        if (orderData.giftType === 'image') {
            let imageUrl = orderData.generatedContent;
            
            if (!imageUrl || !validateUrl(imageUrl)) {
                console.log('⚠️ generatedContent is not a valid URL, attempting fallback...');
                if (orderData.giftId) {
                    try {
                        const Gift = (await import('../models/Gift.js')).default;
                        const gift = await Gift.findById(orderData.giftId);
                        if (gift && gift.selectedImageId && gift.images) {
                            const selectedImage = gift.images.find(img => 
                                img._id.toString() === gift.selectedImageId.toString()
                            );
                            if (selectedImage && validateUrl(selectedImage.url)) {
                                imageUrl = selectedImage.url;
                                console.log('✅ Fallback successful - found image URL:', imageUrl);
                            }
                        }
                    } catch (fallbackError) {
                        console.error('❌ Fallback failed:', fallbackError.message);
                    }
                }
            }
            
            if (imageUrl && validateUrl(imageUrl)) {
                const imageExtension = imageUrl.split('.').pop().toLowerCase() || 'jpg';
                const imageAttachment = await prepareAttachment(
                    imageUrl,
                    `preview_artwork_${orderData.recipientName || 'gift'}.${imageExtension}`,
                    `image/${imageExtension === 'jpg' ? 'jpeg' : imageExtension}`,
                    'preview_image'
                );
                
                if (imageAttachment) {
                    attachments.push(imageAttachment);
                    console.log('✅ Image attachment added to order confirmation');
                } else {
                    console.error('❌ Failed to add image attachment');
                }
            } else {
                console.error('❌ No valid image URL found for order confirmation');
            }
        }
        
        // Handle voice attachments for voice or song gifts
        if (['voice', 'song'].includes(orderData.giftType) && orderData.audioContent) {
            try {
                let audioBuffer;
                if (Buffer.isBuffer(orderData.audioContent)) {
                    audioBuffer = orderData.audioContent;
                    console.log('✅ Audio content is already a Buffer');
                } else if (typeof orderData.audioContent === 'string') {
                    if (orderData.audioContent.startsWith('data:audio')) {
                        const base64Data = orderData.audioContent.split(',')[1];
                        audioBuffer = Buffer.from(base64Data, 'base64');
                        console.log('✅ Converted base64 audio to Buffer');
                    } else if (validateUrl(orderData.audioContent)) {
                        const audioAttachment = await prepareAttachment(
                            orderData.audioContent,
                            `voice_message_${orderData.recipientName || 'gift'}.mp3`,
                            'audio/mpeg'
                        );
                        if (audioAttachment) {
                            audioBuffer = audioAttachment.content;
                            console.log('✅ Downloaded audio from URL');
                        }
                    } else {
                        audioBuffer = Buffer.from(orderData.audioContent);
                        console.log('✅ Converted string audio to Buffer');
                    }
                }
                
                if (audioBuffer) {
                    attachments.push({
                        filename: `${orderData.giftType}_message_${orderData.recipientName || 'gift'}.mp3`,
                        content: audioBuffer,
                        contentType: 'audio/mpeg'
                    });
                    console.log(`✅ ${orderData.giftType} attachment added to order confirmation`);
                }
            } catch (audioError) {
                console.error(`❌ Error adding ${orderData.giftType} attachment to order confirmation:`, audioError.message);
            }
        } else {
            console.log(`⚠️ No audio content found for ${orderData.giftType} gift in order confirmation`);
        }

        const mailOptions = {
            from: `${process.env.FROM_NAME || 'Wispwish Team'} <${process.env.FROM_EMAIL || 'trickyboy467@gmail.com'}>`,
            to: userEmail,
            subject: `✅ Order Confirmed - Your ${orderData.giftType} Gift is Being Prepared!`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                    <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">Order Confirmed! ✅</h1>
                        <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Thank you for your purchase</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <h2 style="color: #333; margin-top: 0;">Hi ${orderData.buyerName || 'Friend'}! 🎉</h2>
                        
                        <p style="color: #666; font-size: 16px; line-height: 1.6;">
                            Your payment has been successfully processed! Your personalized gift is now being crafted with love and will be delivered to your recipient shortly.
                        </p>
                        
                        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin: 25px 0;">
                            <h3 style="color: #333; margin-top: 0; border-bottom: 2px solid #28a745; padding-bottom: 10px;">📋 Complete Order Summary</h3>
                            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 12px 0; color: #666; font-weight: bold; width: 40%;">Order ID:</td>
                                    <td style="padding: 12px 0; color: #333; font-size: 16px; font-weight: bold;">#ORD${orderData.orderId || 'N/A'}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 12px 0; color: #666; font-weight: bold;">Gift Type:</td>
                                    <td style="padding: 12px 0; color: #333;">${orderData.giftType || 'Custom Gift'}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 12px 0; color: #666; font-weight: bold;">Amount Paid:</td>
                                    <td style="padding: 12px 0; color: #28a745; font-size: 18px; font-weight: bold;">$${orderData.price || '0.00'}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 12px 0; color: #666; font-weight: bold;">Recipient Name:</td>
                                    <td style="padding: 12px 0; color: #333;">${orderData.recipientName || 'Special Someone'}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 12px 0; color: #666; font-weight: bold;">Recipient Email:</td>
                                    <td style="padding: 12px 0; color: #333; font-family: monospace; font-size: 14px;">${orderData.recipientEmail || 'N/A'}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 12px 0; color: #666; font-weight: bold;">Order Status:</td>
                                    <td style="padding: 12px 0; color: #28a745; font-weight: bold;">✅ Payment Confirmed - Processing</td>
                                </tr>
                            </table>
                        </div>
                        
                        ${orderData.generatedContent && !['image', 'voice', 'song'].includes(orderData.giftType) ? `
                        <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 25px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #6f42c1;">
                            <h3 style="color: #6f42c1; margin-top: 0;">📝 Your ${orderData.giftType} Content</h3>
                            <div style="background: white; padding: 20px; border-radius: 8px; margin-top: 15px;">
                                <div style="font-style: italic; color: #333; line-height: 1.8; font-size: 16px; white-space: pre-line;">
                                    ${orderData.generatedContent}
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${orderData.giftType === 'image' && attachments.some(a => a.cid === 'preview_image') ? `
                        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin: 25px 0; text-align: center;">
                            <h3 style="color: #333; margin-top: 0;">🖼️ Your Custom Artwork Preview</h3>
                            <img src="cid:preview_image" alt="Custom Artwork" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />
                            <p style="color: #666; font-style: italic;">The artwork is also attached to this email.</p>
                        </div>
                        ` : orderData.giftType === 'image' ? `
                        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin: 25px 0; text-align: center;">
                            <h3 style="color: #333; margin-top: 0;">🖼️ Your Custom Artwork Preview</h3>
                            <p style="color: #666; font-style: italic;">We encountered an issue loading your custom artwork. Please contact support for assistance.</p>
                        </div>
                        ` : ''}
                        
                        ${['voice', 'song'].includes(orderData.giftType) && attachments.some(a => a.filename.includes(`${orderData.giftType}_message`)) ? `
                        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin: 25px 0;">
                            <h3 style="color: #333; margin-top: 0;">🎵 Your ${orderData.giftType.charAt(0).toUpperCase() + orderData.giftType.slice(1)} Message</h3>
                            <p style="color: #666; font-style: italic;">
                                🎧 Your personalized ${orderData.giftType} message is attached to this email. Download and play it to hear your special message!
                            </p>
                        </div>
                        ` : ['voice', 'song'].includes(orderData.giftType) ? `
                        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin: 25px 0;">
                            <h3 style="color: #333; margin-top: 0;">🎵 Your ${orderData.giftType.charAt(0).toUpperCase() + orderData.giftType.slice(1)} Message</h3>
                            <p style="color: #666; font-style: italic;">
                                We encountered an issue with your ${orderData.giftType} message. Please contact support for assistance.
                            </p>
                        </div>
                        ` : ''}
                        
                        <div style="background: #e3f2fd; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #2196f3;">
                            <h4 style="color: #1976d2; margin-top: 0;">⏰ What happens next?</h4>
                            <p style="color: #666; margin-bottom: 10px;">
                                🎯 <strong>Step 1:</strong> Our AI is finalizing your personalized content
                            </p>
                            <p style="color: #666; margin-bottom: 10px;">
                                📧 <strong>Step 2:</strong> Your gift will be delivered to <strong>${orderData.recipientEmail}</strong> within 5-10 minutes
                            </p>
                            <p style="color: #666; margin-bottom: 0;">
                                🎉 <strong>Step 3:</strong> You'll receive a confirmation email once delivery is complete
                            </p>
                        </div>
                        
                        <div style="background: #fff3e0; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #ff9800;">
                            <h4 style="color: #e65100; margin-top: 0;">💝 Important Notes</h4>
                            <ul style="color: #666; margin: 10px 0; padding-left: 20px; line-height: 1.6;">
                                <li>Your recipient will receive this gift at: <strong>${orderData.recipientEmail}</strong></li>
                                <li>The gift includes your personalized ${orderData.giftType} content as shown above</li>
                                <li>Keep this email as your order confirmation and receipt</li>
                                <li>Total amount charged: <strong>$${orderData.price || '0.00'}</strong></li>
                            </ul>
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="http://127.0.0.1:5500/Frontend/index.html" 
                               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                      color: white; 
                                      padding: 15px 30px; 
                                      text-decoration: none; 
                                      border-radius: 25px; 
                                      font-weight: bold; 
                                      display: inline-block;">
                                🎁 Create Another Gift
                            </a>
                        </div>
                        
                        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
                            <p style="color: #666; font-size: 14px; text-align: center; margin-bottom: 10px;">
                                <strong>Need help with your order?</strong> 
                            </p>
                            <p style="color: #666; font-size: 14px; text-align: center; margin: 5px 0;">
                                📧 Reply to this email for support
                            </p>
                            <p style="color: #666; font-size: 14px; text-align: center; margin: 5px 0;">
                                💝 Thank you for choosing Wispwish for your special moments!
                            </p>
                        </div>
                    </div>
                </div>
            `,
            attachments
        };

        const result = await transporter.sendMail(mailOptions);
        console.log('✅ Enhanced order confirmation email sent successfully:', result.messageId);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('❌ Error sending enhanced order confirmation email:', error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Send Gift Delivery Email with the actual gift content
 */
const sendGiftEmail = async (gift) => {
    try {
        const transporter = createTransporter();
        const { giftType, recipientName, senderName, generatedContent, deliveryEmail, audioContent, occasion, senderMessage } = gift;
        
        let giftContent = '';
        let attachments = [];
        
        console.log(`📧 Preparing ${giftType} gift email for ${recipientName} to ${deliveryEmail}`);

        // Generate gift content based on type
        switch (giftType) {
            case 'poem':
                if (!generatedContent) {
                    console.error('❌ No generated content for poem gift');
                    giftContent = `
                        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #6f42c1; margin: 20px 0;">
                            <h3 style="color: #6f42c1; margin-top: 0;">📝 Your Personalized Poem</h3>
                            <p style="color: #666; text-align: center;">
                                We encountered an issue with your poem content. Please contact the sender for assistance.
                            </p>
                        </div>
                    `;
                } else {
                    giftContent = `
                        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #6f42c1; margin: 20px 0;">
                            <h3 style="color: #6f42c1; margin-top: 0;">📝 Your Personalized Poem</h3>
                            <div style="font-style: italic; color: #333; line-height: 1.8; font-size: 16px;">
                                ${generatedContent.replace(/\n/g, '<br>')}
                            </div>
                        </div>
                    `;
                }
                break;
                
            case 'image':
                console.log('🖼️ Processing IMAGE gift type');
                
                let imageUrl = generatedContent;
                if (!imageUrl && gift.selectedImageId && gift.images) {
                    const selectedImage = gift.images.find(img => 
                        img._id.toString() === gift.selectedImageId.toString()
                    );
                    if (selectedImage && validateUrl(selectedImage.url)) {
                        imageUrl = selectedImage.url;
                        console.log('✅ Found image URL from selectedImage:', imageUrl);
                    }
                }
                
                if (imageUrl && validateUrl(imageUrl)) {
                    const imageExtension = imageUrl.split('.').pop().toLowerCase() || 'jpg';
                    const imageAttachment = await prepareAttachment(
                        // imageUrl,
                        // `custom_artwork_for_${recipientName || 'you'}.${imageExtension}`,
                        // `image/${imageExtension === 'jpg' ? 'jpeg' : imageExtension}`,
                        // 'custom-artwork'
                         imageUrl,
    `custom_artwork_for_${recipientName || 'you'}.jpg`,
    'image/jpeg',
    'custom-artwork' // 👈 same as used in HTML
                    );
                    
                    if (imageAttachment) {
                        attachments.push(imageAttachment);
                        console.log('✅ Image attachment added successfully');
                        giftContent = `
                            <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #e91e63; margin: 20px 0;">
                                <h3 style="color: #e91e63; margin-top: 0;">🎨 Your Custom Artwork</h3>
                                <div style="text-align: center; margin: 20px 0;">
                                    <img src="cid:custom-artwork" alt="Your Custom Artwork" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                                </div>
                                <p style="color: #666; font-style: italic; text-align: center;">
                                    🎨 This artwork was specially created just for you! The image is also attached to this email.
                                </p>
                            </div>
                        `;
                    } else {
                        console.error('❌ Failed to add image attachment');
                        giftContent = `
                            <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #e91e63; margin: 20px 0;">
                                <h3 style="color: #e91e63; margin-top: 0;">🎨 Your Custom Artwork</h3>
                                <p style="color: #666; text-align: center;">
                                    We encountered an issue loading your custom artwork. Please contact the sender for assistance.
                                </p>
                            </div>
                        `;
                    }
                } else {
                    console.error('❌ No valid image URL found for image gift');
                    giftContent = `
                        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #e91e63; margin: 20px 0;">
                            <h3 style="color: #e91e63; margin-top: 0;">🎨 Your Custom Artwork</h3>
                            <p style="color: #666; text-align: center;">
                                There was an issue preparing your custom artwork. Please contact the sender.
                            </p>
                        </div>
                    `;
                }
                break;
                
                     case 'voice':
case 'song':
    console.log(`🎵 Processing ${giftType.toUpperCase()} gift type`);
    
    let audioProcessed = false;
    if (audioContent) {
        try {
            let audioBuffer;
            let fileExtension = 'mp3';
            let contentType = 'audio/mpeg';

            if (Buffer.isBuffer(audioContent)) {
                audioBuffer = audioContent;
                console.log(`✅ ${giftType} content is already a Buffer`);
            } else if (typeof audioContent === 'string') {
                if (audioContent.startsWith('data:audio')) {
                    // ✅ Base64 data URL
                    const matches = audioContent.match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
                    if (matches) {
                        contentType = matches[1];
                        fileExtension = contentType.split('/')[1] || 'mp3';
                        audioBuffer = Buffer.from(matches[2], 'base64');
                        console.log(`✅ Converted base64 ${giftType} to Buffer (${contentType})`);
                    } else {
                        console.error("❌ Invalid base64 audio format");
                    }
                } else if (validateUrl(audioContent)) {
                    // ✅ Download from URL
                    const audioAttachment = await prepareAttachment(
                        audioContent,
                        `${giftType}_for_${recipientName || 'you'}.mp3`,
                        'audio/mpeg'
                    );
                    if (audioAttachment) {
                        audioBuffer = audioAttachment.content;
                        contentType = audioAttachment.contentType || 'audio/mpeg';
                        fileExtension = contentType.split('/')[1] || 'mp3';
                        console.log(`✅ Downloaded ${giftType} from URL (${contentType})`);
                    } else {
                        console.error(`❌ Failed to download ${giftType} from URL: ${audioContent}`);
                    }
                } else {
                    // ✅ Handle plain base64 string (without data: prefix)
                    try {
                        audioBuffer = Buffer.from(audioContent, 'base64');
                        console.log(`✅ Converted plain base64 string to Buffer`);
                    } catch (e) {
                        console.error("❌ Failed to convert string audio content to Buffer", e.message);
                    }
                }
            }

            if (audioBuffer && audioBuffer.length > 0) {
                attachments.push({
                    filename: `${giftType}_for_${recipientName || 'you'}.${fileExtension}`,
                    content: audioBuffer,
                    contentType: contentType
                });
                console.log(`✅ ${giftType} attachment added successfully`);
                audioProcessed = true;
            } else {
                console.error(`❌ ${giftType} buffer is empty or invalid`);
            }
        } catch (audioError) {
            console.error(`❌ Error processing ${giftType} attachment:`, audioError.message);
        }
    } else {
        console.error(`❌ No audio content found for ${giftType} gift`);
    }
    
    giftContent = `
        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #28a745; margin: 20px 0;">
            <h3 style="color: #28a745; margin-top: 0;">🎵 Your ${giftType.charAt(0).toUpperCase() + giftType.slice(1)} Message</h3>
            ${generatedContent ? `
            <div style="color: #333; line-height: 1.8; font-size: 16px; margin-bottom: 15px;">
                ${generatedContent.replace(/\n/g, '<br>')}
            </div>
            ` : ''}
            ${audioProcessed ? `
            <p style="color: #666; font-style: italic;">
                🎧 Your personalized ${giftType} message is attached to this email. Download and play it to hear your special message!
            </p>
            ` : `
            <p style="color: #666; font-style: italic;">
                We encountered an issue with your ${giftType} message. Please contact the sender for assistance.
            </p>
            `}
        </div>
    `;
    break;



                
            default:
                giftContent = `
                    <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #fd7e14; margin: 20px 0;">
                        <h3 style="color: #fd7e14; margin-top: 0;">🎁 Your Special Gift</h3>
                        <div style="color: #333; line-height: 1.8; font-size: 16px;">
                            ${generatedContent ? generatedContent.replace(/\n/g, '<br>') : 'Your personalized gift content'}
                        </div>
                    </div>
                `;
        }
        
        const mailOptions = {
            from: `${process.env.FROM_NAME || 'Wispwish Team'} <${process.env.FROM_EMAIL || 'trickyboy467@gmail.com'}>`,
            to: deliveryEmail,
            subject: `🎁 You've Received a Special ${giftType.charAt(0).toUpperCase() + giftType.slice(1)} Gift!`,
            html: `
                <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
                    <div style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">You've Received a Gift! 🎁</h1>
                    </div>
                    
                    <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <h2 style="color: #333; margin-top: 0;">Dear ${recipientName || 'Friend'}, 💝</h2>
                        
                        <p style="color: #666; font-size: 16px; line-height: 1.6;">
                            ${senderName || 'Someone special'} has created a personalized ${giftType} gift just for you! This ${occasion || 'special'} gift was crafted with love and care.
                        </p>
                        
                        ${giftContent}
                        
                        ${senderMessage ? `
                            <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                                <h4 style="color: #856404; margin-top: 0;">💌 Personal Message:</h4>
                                <p style="color: #856404; margin-bottom: 0; font-style: italic;">
                                    "${senderMessage}"
                                </p>
                            </div>
                        ` : ''}
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <p style="color: #666; font-size: 16px;">
                                ✨ This gift was created with Wispwish - where every gift tells a story ✨
                            </p>
                            <a href="http://127.0.0.1:5500/Frontend/index.html" 
                               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                      color: white; 
                                      padding: 12px 25px; 
                                      text-decoration: none; 
                                      border-radius: 20px; 
                                      font-weight: bold; 
                                      display: inline-block; 
                                      margin-top: 10px;">
                                🎁 Create Your Own Gift
                            </a>
                        </div>
                        
                        <p style="color: #666; font-size: 14px; text-align: center; margin-top: 30px;">
                            Made with ❤️ by Wispwish<br>
                            The magic of personalized gifting
                        </p>
                    </div>
                </div>
            `,
            attachments
        };
    
        console.log(`📧 Sending email with ${attachments.length} attachments:`, attachments.map(a => a.filename));
        const result = await transporter.sendMail(mailOptions);
        console.log('✅ Gift email sent successfully:', result.messageId);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('❌ Error sending gift email:', error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Send Payment Confirmation Email
 */
const sendPaymentConfirmation = async ({ buyerEmail, giftType, amount, transactionId }) => {
    try {
        const transporter = createTransporter();
        
        const mailOptions = {
            from: `${process.env.FROM_NAME || 'Wispwish Team'} <${process.env.FROM_EMAIL || 'trickyboy467@gmail.com'}>`,
            to: buyerEmail,
            subject: '💳 Payment Confirmed - Your Gift is Ready!',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                    <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">Payment Confirmed! 💳</h1>
                        <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Your transaction was successful</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <h2 style="color: #333; margin-top: 0;">Thank you for your payment! 🎉</h2>
                        
                        <p style="color: #666; font-size: 16px; line-height: 1.6;">
                            Your payment has been successfully processed and your ${giftType} gift is being delivered to the recipient.
                        </p>
                        
                        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin: 25px 0;">
                            <h3 style="color: #333; margin-top: 0; border-bottom: 2px solid #28a745; padding-bottom: 10px;">💳 Payment Details</h3>
                            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 12px 0; color: #666; font-weight: bold; width: 40%;">Transaction ID:</td>
                                    <td style="padding: 12px 0; color: #333; font-family: monospace; font-size: 14px;">${transactionId}</td>
                                </tr>
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 12px 0; color: #666; font-weight: bold;">Gift Type:</td>
                                    <td style="padding: 12px 0; color: #333;">${giftType}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 12px 0; color: #666; font-weight: bold;">Amount Paid:</td>
                                    <td style="padding: 12px 0; color: #28a745; font-size: 18px; font-weight: bold;">$${amount}</td>
                                </tr>
                            </table>
                        </div>
                        
                        <div style="background: #e3f2fd; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #2196f3;">
                            <h4 style="color: #1976d2; margin-top: 0;">✅ Payment Status: Completed</h4>
                            <p style="color: #666; margin-bottom: 0;">
                                Your gift has been delivered to the recipient. You should receive a separate delivery confirmation email shortly.
                            </p>
                        </div>
                        
                        <div style="text-align: center; margin-top: 30px;">
                            <p style="color: #999; font-size: 14px;">Thank you for using Wispwish! 💝</p>
                        </div>
                    </div>
                </div>
            `
        };
        
        const result = await transporter.sendMail(mailOptions);
        console.log('✅ Payment confirmation email sent successfully:', result.messageId);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('❌ Error sending payment confirmation email:', error.message);
        return { success: false, error: error.message };
    }
};

export default {
    sendWelcomeEmail,
    sendOrderConfirmation,
    sendGiftEmail,
    sendPaymentConfirmation
};