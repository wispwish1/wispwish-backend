

import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import axios from 'axios'; // Add this import

/**
 * Create Nodemailer transporter
 */

const createTransporter = () => {
    // Debug mode - console me email content dikhayega
    if (process.env.NODE_ENV === 'development') {
        return {
            sendMail: async (mailOptions) => {
                console.log('📧 EMAIL CONTENT:', {
                    to: mailOptions.to,
                    subject: mailOptions.subject,
                    html: mailOptions.html.substring(0, 200) + '...'
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
        console.log('Welcome email sent successfully:', result.messageId);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('Error sending welcome email:', error);
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
        
        // Add image attachment for image gifts with fallback logic
        if (orderData.giftType === 'image') {
            let imageUrl = orderData.generatedContent;
            
            // ✅ Fallback: If generatedContent is not a URL, try to get from gift data
            if (!imageUrl || !imageUrl.startsWith('http')) {
                console.log('⚠️ generatedContent is not a valid URL, attempting fallback...');
                if (orderData.giftId) {
                    try {
                        const Gift = (await import('../models/Gift.js')).default;
                        const gift = await Gift.findById(orderData.giftId);
                        if (gift && gift.selectedImageId && gift.images) {
                            const selectedImage = gift.images.find(img => 
                                img._id.toString() === gift.selectedImageId.toString()
                            );
                            if (selectedImage) {
                                imageUrl = selectedImage.url;
                                console.log('✅ Fallback successful - found image URL:', imageUrl);
                            }
                        }
                    } catch (fallbackError) {
                        console.error('❌ Fallback failed:', fallbackError);
                    }
                }
            }
            
            // Download and attach image if URL is valid
            if (imageUrl && imageUrl.startsWith('http')) {
                try {
                    console.log('📎 Adding image attachment to order confirmation:', imageUrl);
                    const response = await axios.get(imageUrl, {
                        responseType: 'arraybuffer',
                        timeout: 15000
                    });
                    
                    const imageBuffer = Buffer.from(response.data);
                    const imageExtension = imageUrl.split('.').pop().toLowerCase() || 'jpg';
                    
                    attachments.push({
                        filename: `preview_artwork_${orderData.recipientName || 'gift'}.${imageExtension}`,
                        content: imageBuffer,
                        contentType: response.headers['content-type'] || `image/${imageExtension}`,
                        cid: 'preview_image' // ✅ CID for embedding in email
                    });
                    
                    console.log('✅ Order confirmation image attachment added successfully');
                } catch (imageError) {
                    console.error('❌ Error adding image to order confirmation:', imageError.message);
                }
            } else {
                console.error('❌ No valid image URL found for order confirmation attachment');
            }
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
                        
                        ${orderData.generatedContent ? `
                        <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 25px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #6f42c1;">
                            <h3 style="color: #6f42c1; margin-top: 0;">📝 Your ${orderData.giftType} Content</h3>
                            <div style="background: white; padding: 20px; border-radius: 8px; margin-top: 15px;">
                                <div style="font-style: italic; color: #333; line-height: 1.8; font-size: 16px; white-space: pre-line;">
                                    ${orderData.generatedContent}
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${orderData.giftType === 'image' && attachments.length > 0 ? `
                        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin: 25px 0; text-align: center;">
                            <h3 style="color: #333; margin-top: 0;">🖼️ Your Custom Artwork Preview</h3>
                            <img src="cid:preview_image" alt="Custom Artwork" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />
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
            attachments // Add attachments array
        };

        const result = await transporter.sendMail(mailOptions);
        console.log('Enhanced order confirmation email sent successfully:', result.messageId);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('Error sending enhanced order confirmation email:', error);
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
      
      console.log('=== DEBUGGING GIFT EMAIL ===');
      console.log('Processing gift email for type:', giftType);
      console.log('Generated content:', generatedContent);
      console.log('Generated content type:', typeof generatedContent);
      console.log('Generated content length:', generatedContent ? generatedContent.length : 'null');
      console.log('Audio content available:', !!audioContent);
      console.log('Full gift object keys:', Object.keys(gift));
      console.log('================================');
      
      // Generate gift content based on type
      switch (giftType) {
          case 'poem':
              giftContent = `
                  <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #6f42c1; margin: 20px 0;">
                      <h3 style="color: #6f42c1; margin-top: 0;">📝 Your Personalized Poem</h3>
                      <div style="font-style: italic; color: #333; line-height: 1.8; font-size: 16px;">
                          ${generatedContent ? generatedContent.replace(/\n/g, '<br>') : 'Your beautiful poem content'}
                      </div>
                  </div>
              `;
              break;
              
          case 'image':
              console.log('Processing IMAGE gift type');
              console.log('generatedContent for image:', generatedContent);
              
              // FALLBACK: If generatedContent is not set, try to get it from selectedImageId
              let imageUrl = generatedContent;
              if (!imageUrl && gift.selectedImageId && gift.images) {
                  console.log('🔄 Fallback: Finding image URL from selectedImageId:', gift.selectedImageId);
                  const selectedImage = gift.images.find(img => {
                      const match = img._id.toString() === gift.selectedImageId.toString();
                      console.log('🔍 Fallback comparing:', img._id.toString(), 'with', gift.selectedImageId.toString(), '- Match:', match);
                      return match;
                  });
                  if (selectedImage) {
                      imageUrl = selectedImage.url;
                      console.log('✅ Fallback successful - found image URL:', imageUrl);
                  } else {
                      console.error('❌ Fallback failed - no matching image found');
                  }
              }
              
              giftContent = `
                  <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #e91e63; margin: 20px 0;">
                      <h3 style="color: #e91e63; margin-top: 0;">🎨 Your Custom Artwork</h3>
                      <div style="text-align: center; margin: 20px 0;">
                          ${imageUrl ? `<img src="cid:custom-artwork" alt="Your Custom Artwork" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">` : '<p>Your beautiful custom artwork</p>'}
                      </div>
                      <p style="color: #666; font-style: italic; text-align: center;">
                          🎨 This artwork was specially created just for you! The image is also attached to this email.
                      </p>
                  `;
              
              // FIXED: Use imageUrl instead of generatedContent
              if (imageUrl) {
                  console.log('🖼️ Adding image attachment for:', imageUrl);
                  try {
                      console.log('📥 Starting image download...');
                      const response = await axios.get(imageUrl, {
                          responseType: 'arraybuffer',
                          timeout: 15000 // Increased timeout to 15 seconds
                      });
                      
                      console.log('📥 Image downloaded successfully, size:', response.data.byteLength);
                      console.log('📥 Content-Type:', response.headers['content-type']);
                      
                      const imageBuffer = Buffer.from(response.data);
                      const imageExtension = imageUrl.split('.').pop().toLowerCase() || 'jpg';
                      
                      attachments.push({
                          filename: `custom_artwork_for_${recipientName || 'you'}.${imageExtension}`,
                          content: imageBuffer,
                          contentType: response.headers['content-type'] || `image/${imageExtension}`,
                          cid: 'custom-artwork'
                      });
                      
                      console.log('✅ Image attachment added successfully');
                      console.log('📎 Attachment details:', {
                          filename: `custom_artwork_for_${recipientName || 'you'}.${imageExtension}`,
                          size: imageBuffer.length,
                          contentType: response.headers['content-type'] || `image/${imageExtension}`
                      });
                  } catch (imageError) {
                      console.error('❌ Error downloading/adding image attachment:', imageError.message);
                      console.error('❌ Full error:', imageError);
                      // Fallback to URL embedding if download fails
                      giftContent = giftContent.replace('cid:custom-artwork', imageUrl);
                  }
              } else {
                  console.log('⚠️ No image URL found for image gift');
                  console.log('⚠️ Gift object selectedImageId:', gift.selectedImageId);
                  console.log('⚠️ Gift object images:', gift.images);
              }
              break;
              
          case 'voice':
              giftContent = `
                  <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #28a745; margin: 20px 0;">
                      <h3 style="color: #28a745; margin-top: 0;">🎵 Your Voice Message</h3>
                      <div style="color: #333; line-height: 1.8; font-size: 16px; margin-bottom: 15px;">
                          ${generatedContent ? generatedContent.replace(/\n/g, '<br>') : 'Your heartfelt message'}
                      </div>
                      <p style="color: #666; font-style: italic;">
                          🎧 Your personalized voice message is attached to this email. Download and play it to hear your special message!
                      </p>
                  </div>
              `;
              
              // FIXED: Add audio attachment if available
              if (audioContent) {
                  console.log('Adding voice message attachment');
                  try {
                      attachments.push({
                          filename: `voice_message_for_${recipientName || 'you'}.mp3`,
                          content: Buffer.isBuffer(audioContent) ? audioContent : Buffer.from(audioContent, 'base64'),
                          contentType: 'audio/mpeg'
                      });
                      console.log('Voice attachment added successfully');
                  } catch (attachError) {
                      console.error('Error adding voice attachment:', attachError);
                  }
              } else {
                  console.log('No audio content found for voice message');
              }
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
          from: process.env.EMAIL_FROM || 'trickyboy467@gmail.com',
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
  
      console.log('Sending email with attachments count:', attachments.length);
      const result = await transporter.sendMail(mailOptions);
      console.log('Gift email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };
  } catch (error) {
      console.error('Error sending gift email:', error);
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
        console.log('Payment confirmation email sent successfully:', result.messageId);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('Error sending payment confirmation email:', error);
        return { success: false, error: error.message };
    }
};

export default {
    sendWelcomeEmail,
    sendOrderConfirmation,
    sendGiftEmail,
    sendPaymentConfirmation
};
