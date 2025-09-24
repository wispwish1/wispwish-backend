import fs from 'fs';
import path from 'path';
import axios from 'axios';
import validator from 'validator';
import nodemailer from 'nodemailer';

/**
 * Create Nodemailer transporter
 */
const createTransporter = () => {
    // Use dry-run mode ONLY if explicitly enabled
    if (String(process.env.EMAIL_DRY_RUN).toLowerCase() === 'true') {
        return {
            sendMail: async (mailOptions) => {
                console.log('📧 [DRY-RUN] EMAIL CONTENT:', {
                    to: mailOptions.to,
                    subject: mailOptions.subject,
                    html: mailOptions.html.substring(0, 200) + '...',
                    attachments: mailOptions.attachments ? mailOptions.attachments.map(a => a.filename) : []
                });
                return { success: true, messageId: 'dry-run-' + Date.now() };
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
 * Helper function to download and prepare attachment with retry logic
 */
const prepareAttachment = async (url, filename, contentType, cid = null, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (!validateUrl(url)) {
                console.error(`❌ Invalid URL for attachment: ${url}`);
                return null;
            }

            console.log(`📥 Downloading attachment from: ${url} (attempt ${attempt}/${maxRetries})`);
            
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000, // Increased timeout to 30 seconds
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'image/*,*/*;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive'
                },
                maxRedirects: 5,
                validateStatus: function (status) {
                    return status >= 200 && status < 300;
                }
            });
            
            const buffer = Buffer.from(response.data);
            if (buffer.length === 0) {
                console.error(`❌ Downloaded file is empty: ${url}`);
                if (attempt < maxRetries) {
                    console.log(`⏳ Retrying download in ${attempt * 2} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, attempt * 2000));
                    continue;
                }
                return null;
            }
            
            console.log(`✅ Successfully downloaded: ${filename} (${buffer.length} bytes) on attempt ${attempt}`);
            
            return {
                filename,
                content: buffer,
                contentType: contentType || response.headers['content-type'] || 'application/octet-stream',
                ...(cid && { cid })
            };
            
        } catch (error) {
            const errorMsg = `❌ Error downloading attachment from ${url} (attempt ${attempt}/${maxRetries}): ${error.message}, Status: ${error.response?.status}`;
            console.error(errorMsg);
            
            // If this is the last attempt, return null
            if (attempt === maxRetries) {
                console.error(`❌ All ${maxRetries} download attempts failed for: ${url}`);
                return null;
            }
            
            // Wait before retrying (exponential backoff)
            const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            console.log(`⏳ Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
    
    return null;
};

/**
 * Generate WishKnot confirmation section with actual message content
 */
const generateWishKnotConfirmationSection = async (orderData) => {
    try {
        if (!orderData.giftId) {
            console.log('⚠️ No giftId provided for WishKnot confirmation section');
            return getDefaultWishKnotSection(orderData);
        }

        // Import WishKnot model dynamically
        const WishKnot = (await import('../models/WishKnot.js')).default;
        const wishKnot = await WishKnot.findOne({ giftId: orderData.giftId });
        
        if (!wishKnot) {
            console.log('⚠️ WishKnot record not found for giftId:', orderData.giftId);
            return getDefaultWishKnotSection(orderData);
        }

        console.log('✅ Found WishKnot data for order confirmation');
        
        const personalizedMessage = wishKnot.personalizedMessage || '';
        const senderMessage = wishKnot.senderMessage || '';
        const knotType = wishKnot.knotType || 'Heart Knot';
        
        return `
        <div style="background: linear-gradient(135deg, #fdf2f8 0%, #f5f3ff 100%); padding: 30px; border-radius: 15px; margin: 25px 0; border: 2px solid #ec4899; text-align: center;">
            <h3 style="color: #ec4899; margin-top: 0; font-size: 20px;">🪢 ${knotType} for ${orderData.recipientName || 'Your Special Someone'}</h3>
            
            <!-- Animated Knot SVG -->
            <div style="margin: 20px 0;">
                <svg width="100" height="100" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 15px rgba(236, 72, 153, 0.3);)">
                    <defs>
                        <linearGradient id="knotGradConfirm" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#ec4899"/>
                            <stop offset="50%" stop-color="#f97316"/>
                            <stop offset="100%" stop-color="#8b5cf6"/>
                        </linearGradient>
                    </defs>
                    <circle cx="60" cy="60" r="55" fill="#fff0f6" stroke="#ec4899" stroke-width="2"/>
                    <path d="M30 60 C 45 40, 75 40, 90 60 C 75 80, 45 80, 30 60 M 40 50 C 50 35, 70 35, 80 50 C 70 65, 50 65, 40 50" 
                          fill="none" stroke="url(#knotGradConfirm)" stroke-width="6" stroke-linecap="round"/>
                    <circle cx="60" cy="60" r="4" fill="#fbbf24">
                        <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite"/>
                    </circle>
                    <!-- Floating particles -->
                    <circle cx="60" cy="40" r="2" fill="#ec4899" opacity="0.6">
                        <animateTransform attributeName="transform" type="translate" values="0,0;8,-8;0,0" dur="3s" repeatCount="indefinite"/>
                    </circle>
                    <circle cx="80" cy="60" r="2" fill="#8b5cf6" opacity="0.6">
                        <animateTransform attributeName="transform" type="translate" values="0,0;-8,-4;0,0" dur="2.5s" repeatCount="indefinite"/>
                    </circle>
                    <circle cx="60" cy="80" r="2" fill="#f97316" opacity="0.6">
                        <animateTransform attributeName="transform" type="translate" values="0,0;-4,8;0,0" dur="3.2s" repeatCount="indefinite"/>
                    </circle>
                    <circle cx="40" cy="60" r="2" fill="#ec4899" opacity="0.6">
                        <animateTransform attributeName="transform" type="translate" values="0,0;4,-6;0,0" dur="2.8s" repeatCount="indefinite"/>
                    </circle>
                </svg>
            </div>
            
            <!-- Show actual message content -->
            ${personalizedMessage ? `
            <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <h4 style="color: #ec4899; margin-top: 0; font-size: 16px;">💫 Your Message Has Been Revealed</h4>
                <div style="color: #333; font-size: 16px; line-height: 1.6; font-style: italic; text-align: left;">
                    ${personalizedMessage.replace(/\n/g, '<br>')}
                </div>
            </div>
            ` : ''}
            
            ${senderMessage ? `
            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ffc107;">
                <h4 style="color: #856404; margin-top: 0; font-size: 14px;">💌 Personal Note from ${orderData.buyerName || 'You'}:</h4>
                <p style="color: #856404; margin-bottom: 0; font-style: italic; text-align: left;">
                    "${senderMessage}"
                </p>
            </div>
            ` : ''}
            
            <p style="color: #666; font-size: 14px; line-height: 1.4; margin: 15px 0;">
                ✨ <strong>WishKnot Successfully Untied!</strong><br>
                The message has been revealed and the emotion released back into the world.
            </p>
            
            <!-- Preview Link for Buyer -->
            <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #0ea5e9;">
                <p style="color: #666; font-size: 12px; line-height: 1.3; margin: 5px 0;">
                    🕰️ <strong>Want to see the interactive experience?</strong><br>
                    <small>Preview how your WishKnot will appear to the recipient:</small>
                </p>
                <div style="text-align: center; margin: 10px 0;">
                    <a href="${process.env.BASE_URL || 'http://127.0.0.1:5500'}/wishknot-view.html?giftId=${orderData.giftId || 'preview'}&preview=true" 
                       style="background: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%); 
                              color: white; 
                              padding: 8px 16px; 
                              text-decoration: none; 
                              border-radius: 15px; 
                              font-weight: bold; 
                              display: inline-block;
                              font-size: 12px;">
                        🪢 Preview WishKnot Experience
                    </a>
                </div>
            </div>
        </div>
        `;
        
    } catch (error) {
        console.error('❌ Error generating WishKnot confirmation section:', error.message);
        return getDefaultWishKnotSection(orderData);
    }
};

/**
 * Get default WishKnot section when actual data is not available
 */
const getDefaultWishKnotSection = (orderData) => {
    return `
    <div style="background: linear-gradient(135deg, #fdf2f8 0%, #f5f3ff 100%); padding: 30px; border-radius: 15px; margin: 25px 0; border: 2px solid #ec4899; text-align: center;">
        <h3 style="color: #ec4899; margin-top: 0; font-size: 20px;">🪢 WishKnot Gift Created Successfully!</h3>
        
        <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 15px 0;">
            Your WishKnot has been carefully tied and is ready for delivery!<br>
            The recipient will receive a special interactive experience to untie the knot.
        </p>
        
        <div style="background: rgba(236, 72, 153, 0.1); padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p style="color: #666; font-style: italic; line-height: 1.4; text-align: center; margin: 0;">
                🔒 <strong>Your message is safely sealed inside the knot</strong><br>
                <small>The recipient will experience the joy of untying it to reveal your special message</small>
            </p>
        </div>
    </div>
    `;
};

/**
 * Send WishKnot Email
 */
const sendWishKnotEmail = async ({
  recipientEmail,
  recipientName,
  senderName,
  knotType,
  occasion,
  viewUrl,
  giftId,
  accessToken,
  scheduledRevealDate = null
}) => {
  try {
    console.log('🪢 WISHKNOT EMAIL SEND CALLED:');
    console.log('🪢 Recipient:', recipientEmail);
    console.log('🪢 ViewURL:', viewUrl);
    console.log('🪢 GiftId:', giftId);
    console.log('🪢 AccessToken:', accessToken?.substring(0, 8) + '...');
    
    const transporter = createTransporter();
    
    const isScheduled = scheduledRevealDate && new Date(scheduledRevealDate) > new Date();
    const revealText = isScheduled 
      ? `This WishKnot is scheduled to be revealed on ${new Date(scheduledRevealDate).toLocaleDateString()}`
      : 'Click below to untie your WishKnot and reveal the special message';
    
    const mailOptions = {
      from: `${process.env.FROM_NAME || 'Wispwish Team'} <${process.env.FROM_EMAIL || 'trickyboy467@gmail.com'}>`,
      to: recipientEmail,
      subject: `🪢 ${senderName} has tied a WishKnot for you!`,
      html: `
        <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(to bottom right, #fdf2f8, #f5f3ff, #eef2ff);">
          <!-- CSS Animations for Interactive WishKnot -->
          <style>
            @keyframes wishknotUntieAnimation {
              0% { transform: scale(1) rotate(0deg); opacity: 1; }
              25% { transform: scale(1.1) rotate(90deg); }
              50% { transform: scale(0.9) rotate(180deg); }
              75% { transform: scale(1.2) rotate(270deg); opacity: 0.7; }
              100% { transform: scale(0) rotate(360deg); opacity: 0; }
            }
            
            @keyframes sparkleAnimation {
              0% { opacity: 0; }
              30% { opacity: 1; }
              100% { opacity: 0; }
            }
            
            @keyframes twinkle {
              0%, 100% { opacity: 0; transform: scale(0); }
              50% { opacity: 1; transform: scale(1); }
            }
            
            @keyframes messageReveal {
              0% { opacity: 0; transform: translateY(30px) scale(0.95); }
              50% { opacity: 0.7; transform: translateY(-5px) scale(1.02); }
              100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            

            .email-untie-button {
              background: linear-gradient(135deg, #ec4899, #8b5cf6);
              color: white;
              border: none;
              padding: 16px 32px;
              border-radius: 50px;
              font-size: 16px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.3s ease;
              box-shadow: 0 6px 20px rgba(236, 72, 153, 0.3);
              margin: 20px 0;
              text-decoration: none;
              display: inline-block;
            }
            
            .email-untie-button:hover {
              transform: translateY(-2px);
              box-shadow: 0 8px 25px rgba(236, 72, 153, 0.4);
            }
            

          </style>
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%); padding: 40px 30px; text-align: center; border-radius: 20px 20px 0 0; box-shadow: 0 8px 25px rgba(236, 72, 153, 0.3);">
            <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">🪢 A WishKnot Awaits</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 18px;">
              From ${senderName} • ${occasion}
            </p>
          </div>
          
          <!-- Main Content -->
          <div style="background: white; padding: 40px 30px; border-radius: 0 0 20px 20px; box-shadow: 0 8px 25px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-top: 0; font-size: 24px; text-align: center;">Dear ${recipientName}, 💝</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6; text-align: center; margin: 20px 0;">
              ${senderName} has carefully tied a special WishKnot just for you! This ${knotType} knot contains a heartfelt message waiting to be untied.
            </p>
            
            <!-- Interactive WishKnot Animation -->
            <div class="email-knot-container">
              <div style="background: linear-gradient(135deg, #fdf2f8, #f5f3ff); border-radius: 15px; overflow: hidden; position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
                <svg class="email-knot-svg" id="emailKnotSvg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 15px rgba(236, 72, 153, 0.3);">
                  <defs>
                    <linearGradient id="emailKnotGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#ec4899"/>
                      <stop offset="50%" stop-color="#f97316"/>
                      <stop offset="100%" stop-color="#8b5cf6"/>
                    </linearGradient>
                  </defs>
                  <circle cx="100" cy="100" r="90" fill="#fff0f6" stroke="#ec4899" stroke-width="2"/>
                  <!-- Main knot path -->
                  <path d="M50 100 C 75 70, 125 70, 150 100 C 125 130, 75 130, 50 100 M 70 85 C 85 60, 115 60, 130 85 C 115 110, 85 110, 70 85" 
                        fill="none" stroke="url(#emailKnotGrad)" stroke-width="8" stroke-linecap="round"/>
                  <!-- Center glow -->
                  <circle cx="100" cy="100" r="6" fill="#fbbf24">
                    <animate attributeName="r" values="6;10;6" dur="2s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite"/>
                  </circle>
                  <!-- Floating particles -->
                  <circle cx="100" cy="70" r="3" fill="#ec4899" opacity="0.6">
                    <animateTransform attributeName="transform" type="translate" values="0,0;10,-10;0,0" dur="3s" repeatCount="indefinite"/>
                  </circle>
                  <circle cx="130" cy="100" r="3" fill="#8b5cf6" opacity="0.6">
                    <animateTransform attributeName="transform" type="translate" values="0,0;-10,-5;0,0" dur="2.5s" repeatCount="indefinite"/>
                  </circle>
                  <circle cx="100" cy="130" r="3" fill="#f97316" opacity="0.6">
                    <animateTransform attributeName="transform" type="translate" values="0,0;-5,10;0,0" dur="3.5s" repeatCount="indefinite"/>
                  </circle>
                  <circle cx="70" cy="100" r="3" fill="#ec4899" opacity="0.6">
                    <animateTransform attributeName="transform" type="translate" values="0,0;5,-8;0,0" dur="2.8s" repeatCount="indefinite"/>
                  </circle>
                </svg>
                
                <!-- Sparkles overlay -->
                <div class="email-sparkles" id="emailSparkles"></div>
              </div>
            </div>
            
            <div style="background: rgba(236, 72, 153, 0.1); padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">
              <p style="color: #666; font-style: italic; line-height: 1.6; margin: 0;">
                🔒 <strong>Your WishKnot is sealed and animated above!</strong> 🔒<br>
                <small>Click below to open the interactive WishKnot viewer and untie your gift</small>
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="color: #666; font-size: 16px; margin-bottom: 20px;">
                ${revealText}
              </p>
              
              ${!isScheduled ? `
                <a href="${viewUrl || `${process.env.BASE_URL || 'http://127.0.0.1:5500'}/wishknot-view.html?giftId=${giftId}&token=${accessToken}`}" class="email-untie-button">
                  🪢 Open WishKnot Viewer
                </a>
              ` : `
                <div style="background: #fef3c7; padding: 15px; border-radius: 10px; border: 2px solid #f59e0b;">
                  <p style="color: #92400e; margin: 0; font-weight: 600;">⏰ Scheduled for ${new Date(scheduledRevealDate).toLocaleDateString()}</p>
                </div>
              `}
            </div>
            
            <div style="background: #f0f9ff; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #0ea5e9;">
              <h4 style="color: #0369a1; margin-top: 0;">💡 What is a WishKnot?</h4>
              <p style="color: #666; margin-bottom: 0; line-height: 1.6;">
                A WishKnot is a symbolic digital gift — a knotted animation carrying a personal message, 
                like a hug tied in time. When you "untie" it, the stored emotion and message are released back into the world.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <p style="color: #666; font-size: 14px; margin-bottom: 10px;">💡 This interactive experience works best on desktop or mobile browsers</p>
              <p style="color: #999; font-size: 12px;">Made with ❤️ by Wispwish • The magic of personalized gifting</p>
            </div>
          </div>
          

        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ WishKnot email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Error sending WishKnot email:', error.message);
    return { success: false, error: error.message };
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
        // Fix invalid email address format by removing extra backtick
        const cleanUserEmail = userEmail ? userEmail.replace(/`/g, '') : userEmail;
        const transporter = createTransporter();
        let attachments = [];
        
        console.log(`📧 Preparing order confirmation for ${cleanUserEmail}, giftType: ${orderData.giftType}`);

        // Handle image attachments for image/illustration gifts
        if (['image', 'illustration'].includes(orderData.giftType)) {
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
        
        // Handle voice attachments for voice, song, and combo gifts
        if ((['voice', 'song'].includes(orderData.giftType) || orderData.giftType === 'combo') && orderData.audioContent) {
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
        } else if (['voice', 'song'].includes(orderData.giftType)) {
            console.log(`⚠️ No audio content found for ${orderData.giftType} gift in order confirmation`);
        } else if (orderData.giftType === 'combo') {
            console.log('⚠️ No audio content found for combo gift in order confirmation');
            // For combo gifts, check if voice component exists in generatedContent
            if (orderData.generatedContent && typeof orderData.generatedContent === 'object' && 
                orderData.generatedContent.components && orderData.generatedContent.components.voice) {
                const voiceComponent = orderData.generatedContent.components.voice;
                if (voiceComponent.audio || voiceComponent.audioUrl) {
                    try {
                        let audioBuffer;
                        let contentType = 'audio/mpeg';
                        
                        if (voiceComponent.audio) {
                            // Handle base64 audio
                            audioBuffer = Buffer.from(voiceComponent.audio, 'base64');
                            console.log('✅ Converted combo voice component base64 to Buffer');
                        } else if (voiceComponent.audioUrl && voiceComponent.audioUrl.startsWith('data:audio')) {
                            // Handle data URL
                            const base64Data = voiceComponent.audioUrl.split(',')[1];
                            audioBuffer = Buffer.from(base64Data, 'base64');
                            console.log('✅ Converted combo voice component data URL to Buffer');
                        } else if (voiceComponent.audioUrl) {
                            // Handle URL
                            const audioAttachment = await prepareAttachment(
                                voiceComponent.audioUrl,
                                `voice_message_${orderData.recipientName || 'gift'}.mp3`,
                                'audio/mpeg'
                            );
                            if (audioAttachment) {
                                audioBuffer = audioAttachment.content;
                                console.log('✅ Downloaded combo voice component from URL');
                            }
                        }
                        
                        if (audioBuffer) {
                            attachments.push({
                                filename: `voice_message_${orderData.recipientName || 'gift'}.mp3`,
                                content: audioBuffer,
                                contentType: contentType
                            });
                            console.log('✅ Voice attachment from combo gift added to order confirmation');
                        }
                    } catch (audioError) {
                        console.error('❌ Error adding voice attachment from combo gift:', audioError.message);
                    }
                }
            }
            
            // For combo gifts, also check for image component
            if (orderData.generatedContent && typeof orderData.generatedContent === 'object' && 
                orderData.generatedContent.components && orderData.generatedContent.components.illustration) {
                const illustrationComponent = orderData.generatedContent.components.illustration;
                let imageUrl = illustrationComponent.images?.[0]?.url || illustrationComponent.imageUrl;
                                
                if (imageUrl && validateUrl(imageUrl)) {
                    const imageExtension = imageUrl.split('.').pop().toLowerCase() || 'jpg';
                    const imageAttachment = await prepareAttachment(
                        imageUrl,
                        `illustration_for_${orderData.recipientName || 'gift'}.${imageExtension}`,
                        `image/${imageExtension === 'jpg' ? 'jpeg' : imageExtension}`,
                        'combo-illustration'
                    );
                                    
                    if (imageAttachment) {
                        attachments.push(imageAttachment);
                        console.log('✅ Illustration attachment from combo gift added to order confirmation');
                    }
                }
            }
        }

        // Generate WishKnot section if needed
        let wishKnotSection = '';
        if (orderData.giftType === 'wishknot') {
            wishKnotSection = await generateWishKnotConfirmationSection(orderData);
        }

        const mailOptions = {
            from: `${process.env.FROM_NAME || 'Wispwish Team'} <${process.env.FROM_EMAIL || 'trickyboy467@gmail.com'}>`,
            to: cleanUserEmail,
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
                        
                        ${orderData.generatedContent && !['image', 'illustration', 'voice', 'song', 'wishknot'].includes(orderData.giftType) ? `
                        <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 25px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #6f42c1;">
                            <h3 style="color: #6f42c1; margin-top: 0;">📝 Your ${orderData.giftType} Content</h3>
                            <div style="background: white; padding: 20px; border-radius: 8px; margin-top: 15px;">
                                <div style="font-style: italic; color: #333; line-height: 1.8; font-size: 16px; white-space: pre-line;">
                                    ${typeof orderData.generatedContent === 'object' ? orderData.generatedContent.text || JSON.stringify(orderData.generatedContent) : orderData.generatedContent}
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${['image', 'illustration'].includes(orderData.giftType) && attachments.some(a => a.cid === 'preview_image' || a.cid === 'custom-artwork') ? `
                        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin: 25px 0; text-align: center;">
                            <h3 style="color: #333; margin-top: 0;">🆼️ Your Custom ${orderData.giftType === 'illustration' ? 'Illustration' : 'Artwork'} Preview</h3>
                            <img src="cid:${attachments.find(a => a.cid === 'custom-artwork' || a.cid === 'preview_image')?.cid}" alt="Custom ${orderData.giftType === 'illustration' ? 'Illustration' : 'Artwork'}" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); display: block; margin: 0 auto;" />
                            <p style="color: #666; font-style: italic; margin-top: 15px;">Your custom ${orderData.giftType} is also attached to this email for download.</p>
                        </div>
                        ` : ['image', 'illustration'].includes(orderData.giftType) ? `
                        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin: 25px 0; text-align: center;">
                            <h3 style="color: #333; margin-top: 0;">🆼️ Your Custom ${orderData.giftType === 'illustration' ? 'Illustration' : 'Artwork'} Preview</h3>
                            <div style="background: #fff; padding: 20px; border-radius: 10px; border: 2px dashed #e91e63; margin: 15px 0;">
                                <p style="color: #666; margin: 0 0 10px 0;">Your custom ${orderData.giftType} is ready!</p>
                                <p style="color: #999; font-size: 14px; margin: 0 0 15px 0;">There was a temporary issue displaying the preview, but your ${orderData.giftType} has been successfully created.</p>
                                <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #0ea5e9;">
                                    <p style="color: #0369a1; font-size: 12px; margin: 0; line-height: 1.4;">
                                        📝 <strong>Note:</strong> Your recipient will receive the full ${orderData.giftType} in their gift email.
                                    </p>
                                </div>
                            </div>
                        </div>
                        ` : orderData.giftType === 'video' && orderData.generatedContent ? `
                        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin: 25px 0; text-align: center;">
                            <h3 style="color: #333; margin-top: 0;">🎥 Your Video Tribute Preview</h3>
                            <div style="background: #fff; padding: 20px; border-radius: 10px; border: 2px solid #6366f1; margin: 15px 0;">
                                <p style="color: #666; margin: 0 0 15px 0;">Your personalized video tribute is ready!</p>
                                <a href="${orderData.generatedContent}" target="_blank" style="background: #6366f1; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
                                    🎥 Preview Your Video
                                </a>
                                <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #0ea5e9;">
                                    <p style="color: #0369a1; font-size: 12px; margin: 0; line-height: 1.4;">
                                        📝 <strong>Note:</strong> Your recipient will receive this video in their gift email.
                                    </p>
                                </div>
                            </div>
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
                        
                        ${orderData.giftType === 'wishknot' ? wishKnotSection : ''}
                        
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
                                <li>The gift includes your personalized ${orderData.giftType === 'wishknot' ? 'WishKnot with sealed message' : orderData.giftType + ' content'} ${orderData.giftType !== 'wishknot' ? 'as shown above' : 'ready for interactive untying'}</li>
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
        console.error('❌ Error sending enhanced order confirmation email:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send Gift Delivery Email with the actual gift content
 * NOTE: This function should NEVER be called for WishKnot gifts!
 * WishKnot gifts must use sendWishKnotEmail function instead.
 */
const sendGiftEmail = async (gift) => {
    try {
        // SAFETY CHECK: Prevent WishKnot gifts from using this function
        if (gift.giftType === 'wishknot') {
            console.error('🚫 CRITICAL ERROR: WishKnot gift sent to sendGiftEmail instead of sendWishKnotEmail!');
            console.error('🚫 Gift details:', { 
                giftId: gift._id || gift.giftId, 
                giftType: gift.giftType,
                recipientName: gift.recipientName,
                recipientEmail: gift.deliveryEmail
            });
            
            return {
                success: false,
                error: 'WishKnot gifts must use sendWishKnotEmail function, not sendGiftEmail!'
            };
        }
        const transporter = createTransporter();
        const { giftType, recipientName, senderName, generatedContent, deliveryEmail, audioContent, occasion, senderMessage } = gift;
        
        console.log('📧 sendGiftEmail called with:');
        console.log('📧 Gift Type:', giftType);
        console.log('📧 Recipient:', recipientName);
        console.log('📧 Delivery Email:', deliveryEmail);
        console.log('📧 Has Generated Content:', !!generatedContent);
        
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
                    // Handle case where generatedContent might be an object instead of string
                    let poemContent = generatedContent;
                    if (typeof generatedContent === 'object') {
                        // Try to extract the actual poem text from the object
                        if (generatedContent.text) {
                            poemContent = generatedContent.text;
                        } else if (generatedContent.poem) {
                            poemContent = generatedContent.poem;
                        } else if (generatedContent.content) {
                            poemContent = generatedContent.content;
                        } else {
                            // If we can't find the text, convert the object to string
                            poemContent = JSON.stringify(generatedContent, null, 2);
                        }
                    }
                    
                    // Ensure poemContent is a string before calling replace
                    if (typeof poemContent !== 'string') {
                        poemContent = String(poemContent);
                    }
                    
                    giftContent = `
                        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #6f42c1; margin: 20px 0;">
                            <h3 style="color: #6f42c1; margin-top: 0;">📝 Your Personalized Poem</h3>
                            <div style="font-style: italic; color: #333; line-height: 1.8; font-size: 16px;">
                                ${poemContent.replace(/\n/g, '<br>')}
                            </div>
                        </div>
                    `;
                }
                break;
                
            case 'image':
            case 'illustration':
                console.log('🖼️ Processing IMAGE/ILLUSTRATION gift type');
                
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
                        imageUrl,
                        `preview_artwork_${recipientName || 'gift'}.${imageExtension}`,
                        `image/${imageExtension === 'jpg' ? 'jpeg' : imageExtension}`,
                        'custom-artwork'
                    );
                    
                    if (imageAttachment) {
                        attachments.push(imageAttachment);
                        console.log('✅ Image attachment added to gift email');
                    } else {
                        console.error('❌ Failed to add image attachment');
                    }
                } else {
                    console.error('❌ No valid image URL found for gift email');
                }
                break;
                
            case 'voice':
            case 'song':
                console.log('🎤 Processing VOICE/SONG gift type');
                
                let audioBuffer;
                if (Buffer.isBuffer(audioContent)) {
                    audioBuffer = audioContent;
                    console.log('✅ Audio content is already a Buffer');
                } else if (typeof audioContent === 'string') {
                    if (audioContent.startsWith('data:audio')) {
                        const base64Data = audioContent.split(',')[1];
                        audioBuffer = Buffer.from(base64Data, 'base64');
                        console.log('✅ Converted base64 audio to Buffer');
                    } else if (validateUrl(audioContent)) {
                        const audioAttachment = await prepareAttachment(
                            audioContent,
                            `voice_message_${recipientName || 'gift'}.mp3`,
                            'audio/mpeg'
                        );
                        if (audioAttachment) {
                            audioBuffer = audioAttachment.content;
                            console.log('✅ Downloaded audio from URL');
                        }
                    } else {
                        audioBuffer = Buffer.from(audioContent);
                        console.log('✅ Converted string audio to Buffer');
                    }
                }
                
                if (audioBuffer) {
                    attachments.push({
                        filename: `${giftType}_message_${recipientName || 'gift'}.mp3`,
                        content: audioBuffer,
                        contentType: 'audio/mpeg'
                    });
                    console.log(`✅ ${giftType} attachment added to gift email`);
                } else {
                    console.error('❌ No valid audio content found for gift email');
                }
                break;
                
            case 'combo':
                console.log('🎬 Processing COMBO gift type');
                
                if (generatedContent && typeof generatedContent === 'object' && 
                    generatedContent.components && generatedContent.components.voice) {
                    const voiceComponent = generatedContent.components.voice;
                    if (voiceComponent.audio || voiceComponent.audioUrl) {
                        try {
                            let audioBuffer;
                            let contentType = 'audio/mpeg';
                            
                            if (voiceComponent.audio) {
                                // Handle base64 audio
                                audioBuffer = Buffer.from(voiceComponent.audio, 'base64');
                                console.log('✅ Converted combo voice component base64 to Buffer');
                            } else if (voiceComponent.audioUrl && voiceComponent.audioUrl.startsWith('data:audio')) {
                                // Handle data URL
                                const base64Data = voiceComponent.audioUrl.split(',')[1];
                                audioBuffer = Buffer.from(base64Data, 'base64');
                                console.log('✅ Converted combo voice component data URL to Buffer');
                            } else if (voiceComponent.audioUrl) {
                                // Handle URL
                                const audioAttachment = await prepareAttachment(
                                    voiceComponent.audioUrl,
                                    `voice_message_${recipientName || 'gift'}.mp3`,
                                    'audio/mpeg'
                                );
                                if (audioAttachment) {
                                    audioBuffer = audioAttachment.content;
                                    console.log('✅ Downloaded combo voice component from URL');
                                }
                            }
                            
                            if (audioBuffer) {
                                attachments.push({
                                    filename: `voice_message_${recipientName || 'gift'}.mp3`,
                                    content: audioBuffer,
                                    contentType: contentType
                                });
                                console.log('✅ Voice attachment from combo gift added to gift email');
                            }
                        } catch (audioError) {
                            console.error('❌ Error adding voice attachment from combo gift:', audioError.message);
                        }
                    }
                }
                
                // For combo gifts, also check for image component
                if (generatedContent && typeof generatedContent === 'object' && 
                    generatedContent.components && generatedContent.components.illustration) {
                    const illustrationComponent = generatedContent.components.illustration;
                    let imageUrl = illustrationComponent.images?.[0]?.url || illustrationComponent.imageUrl;
                                    
                    if (imageUrl && validateUrl(imageUrl)) {
                        const imageExtension = imageUrl.split('.').pop().toLowerCase() || 'jpg';
                        const imageAttachment = await prepareAttachment(
                            imageUrl,
                            `illustration_for_${recipientName || 'gift'}.${imageExtension}`,
                            `image/${imageExtension === 'jpg' ? 'jpeg' : imageExtension}`,
                            'combo-illustration'
                        );
                                        
                        if (imageAttachment) {
                            attachments.push(imageAttachment);
                            console.log('✅ Illustration attachment from combo gift added to gift email');
                        }
                    }
                }
                break;
                
            case 'video':
                console.log('🎬 Processing VIDEO gift type');
                
                if (generatedContent) {
                    const videoUrl = generatedContent;
                    if (validateUrl(videoUrl)) {
                        const videoAttachment = await prepareAttachment(
                            videoUrl,
                            `video_message_${recipientName || 'gift'}.mp4`,
                            'video/mp4'
                        );
                        if (videoAttachment) {
                            attachments.push(videoAttachment);
                            console.log('✅ Video attachment added to gift email');
                        } else {
                            console.error('❌ Failed to add video attachment');
                        }
                    } else {
                        console.error('❌ No valid video URL found for gift email');
                    }
                } else {
                    console.error('❌ No video content found for gift email');
                }
                break;
                
            default:
                console.error('❌ Unknown gift type:', giftType);
                giftContent = `
                    <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #6f42c1; margin: 20px 0;">
                        <h3 style="color: #6f42c1; margin-top: 0;">🎁 Your Custom Gift</h3>
                        <p style="color: #666; text-align: center;">
                            We encountered an issue with your custom gift content. Please contact the sender for assistance.
                        </p>
                    </div>
                `;
                break;
                
            case 'voice':
            case 'song':
                console.log('🎤 Processing VOICE/SONG gift type');
                
                // let audioBuffer;
                if (Buffer.isBuffer(audioContent)) {
                    audioBuffer = audioContent;
                    console.log('✅ Audio content is already a Buffer');
                } else if (typeof audioContent === 'string') {
                    if (audioContent.startsWith('data:audio')) {
                        const base64Data = audioContent.split(',')[1];
                        audioBuffer = Buffer.from(base64Data, 'base64');
                        console.log('✅ Converted base64 audio to Buffer');
                    } else if (validateUrl(audioContent)) {
                        const audioAttachment = await prepareAttachment(
                            audioContent,
                            `voice_message_${recipientName || 'gift'}.mp3`,
                            'audio/mpeg'
                        );
                        if (audioAttachment) {
                            audioBuffer = audioAttachment.content;
                            console.log('✅ Downloaded audio from URL');
                        }
                    } else {
                        audioBuffer = Buffer.from(audioContent);
                        console.log('✅ Converted string audio to Buffer');
                    }
                }
                
                if (audioBuffer) {
                    attachments.push({
                        filename: `${giftType}_message_${recipientName || 'gift'}.mp3`,
                        content: audioBuffer,
                        contentType: 'audio/mpeg'
                    });
                    console.log(`✅ ${giftType} attachment added to gift email`);
                } else {
                    console.error('❌ Failed to add audio attachment');
                }
                break;
                
            case 'combo':
                console.log('🎬 Processing COMBO gift type');
                
                let comboContent = '';
                let comboAttachments = [];
                
                if (generatedContent && typeof generatedContent === 'object' && generatedContent.components) {
                    // Handle poem component
                    if (generatedContent.components.poem) {
                        const poemText = generatedContent.components.poem.text || generatedContent.components.poem;
                        // Handle case where poemText might be an object instead of string
                        let formattedPoemText = poemText;
                        if (typeof poemText === 'object') {
                            // Try to extract the actual poem text from the object
                            if (poemText.text) {
                                formattedPoemText = poemText.text;
                            } else if (poemText.poem) {
                                formattedPoemText = poemText.poem;
                            } else if (poemText.content) {
                                formattedPoemText = poemText.content;
                            } else {
                                // If we can't find the text, convert the object to string
                                formattedPoemText = JSON.stringify(poemText, null, 2);
                            }
                        }
                        
                        // Ensure formattedPoemText is a string before calling replace
                        if (typeof formattedPoemText !== 'string') {
                            formattedPoemText = String(formattedPoemText);
                        }
                        
                        comboContent += `
                            <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #6f42c1; margin: 20px 0;">
                                <h3 style="color: #6f42c1; margin-top: 0;">📝 Your Personalized Poem</h3>
                                <div style="font-style: italic; color: #333; line-height: 1.8; font-size: 16px;">
                                    ${formattedPoemText.replace(/\n/g, '<br>')}
                                </div>
                            </div>
                        `;
                    }
                    
                    // Handle illustration component
                    if (generatedContent.components.illustration) {
                        let imageUrl = generatedContent.components.illustration.images?.[0]?.url || 
                                      generatedContent.components.illustration.imageUrl || 
                                      generatedContent.components.illustration;
                        
                        if (typeof imageUrl === 'object' && imageUrl.url) {
                            imageUrl = imageUrl.url;
                        }
                        
                        if (imageUrl && validateUrl(imageUrl)) {
                            const imageExtension = imageUrl.split('.').pop().toLowerCase() || 'jpg';
                            const imageAttachment = await prepareAttachment(
                                imageUrl,
                                `illustration_for_${recipientName || 'gift'}.${imageExtension}`,
                                `image/${imageExtension === 'jpg' ? 'jpeg' : imageExtension}`,
                                'combo-illustration'
                            );
                            
                            if (imageAttachment) {
                                comboAttachments.push(imageAttachment);
                                console.log('✅ Illustration attachment added to combo gift email');
                                comboContent += `
                                    <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #e91e63; margin: 20px 0;">
                                        <h3 style="color: #e91e63; margin-top: 0;">🎨 Custom Illustration</h3>
                                        <div style="text-align: center; margin: 20px 0;">
                                            <img src="cid:combo-illustration" alt="Your Custom Illustration" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); display: block; margin: 0 auto;">
                                        </div>
                                        <p style="color: #666; font-style: italic; text-align: center; margin-top: 15px;">
                                            🎨 This illustration was specially created just for you!
                                        </p>
                                    </div>
                                `;
                            } else {
                                comboContent += `
                                    <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #e91e63; margin: 20px 0;">
                                        <h3 style="color: #e91e63; margin-top: 0;">🎨 Custom Illustration</h3>
                                        <div style="text-align: center; margin: 20px 0;">
                                            <div style="background: #fff; padding: 20px; border-radius: 10px; border: 2px dashed #e91e63;">
                                                <p style="color: #666; margin: 0 0 10px 0;">Your custom illustration is ready!</p>
                                                <p style="color: #999; font-size: 14px; margin: 0 0 15px 0;">Due to a temporary connection issue, the image is available via direct link:</p>
                                                <a href="${imageUrl}" target="_blank" style="background: #e91e63; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
                                                    🖼️ View Your Illustration
                                                </a>
                                            </div>
                                        </div>
                                        <p style="color: #666; font-style: italic; text-align: center;">
                                            🎨 This illustration was specially created just for you!
                                        </p>
                                    </div>
                                `;
                            }
                        } else {
                            console.error('❌ No valid image URL found for combo gift email');
                        }
                    }
                    
                    // Handle voice component
                    if (generatedContent.components.voice) {
                        const voiceComponent = generatedContent.components.voice;
                        let audioProcessed = false;
                        let audioBuffer;
                        let fileExtension = 'mp3';
                        let contentType = 'audio/mpeg';
                        
                        try {
                            // Check for audio data in different formats
                            const audioData = voiceComponent.audio || voiceComponent.audioUrl || voiceComponent.voiceMessage?.audioUrl;
                            
                            if (audioData) {
                                if (audioData.startsWith('data:audio')) {
                                    // Handle data URL
                                    const base64Data = audioData.split(',')[1];
                                    audioBuffer = Buffer.from(base64Data, 'base64');
                                    console.log('✅ Converted combo voice component data URL to Buffer');
                                } else if (validateUrl(audioData)) {
                                    // Handle URL
                                    const audioAttachment = await prepareAttachment(
                                        audioData,
                                        `voice_message_for_${recipientName || 'you'}.mp3`,
                                        'audio/mpeg'
                                    );
                                    if (audioAttachment) {
                                        audioBuffer = audioAttachment.content;
                                        contentType = audioAttachment.contentType || 'audio/mpeg';
                                        fileExtension = contentType.split('/')[1] || 'mp3';
                                        console.log('✅ Downloaded combo voice component from URL');
                                    }
                                } else {
                                    // Handle plain base64
                                    audioBuffer = Buffer.from(audioData, 'base64');
                                    console.log('✅ Converted combo voice component base64 to Buffer');
                                }
                                
                                if (audioBuffer && audioBuffer.length > 0) {
                                    comboAttachments.push({
                                        filename: `voice_message_for_${recipientName || 'you'}.${fileExtension}`,
                                        content: audioBuffer,
                                        contentType: contentType
                                    });
                                    console.log('✅ Voice attachment from combo gift added successfully');
                                    audioProcessed = true;
                                }
                            }
                            
                            // Add voice content to combo content
                            const voiceText = voiceComponent.text || voiceComponent.script || voiceComponent.voiceMessage?.script || 'Your personalized voice message';
                            comboContent += `
                                <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #28a745; margin: 20px 0;">
                                    <h3 style="color: #28a745; margin-top: 0;">🎵 Voice Message</h3>
                                    <div style="color: #333; line-height: 1.8; font-size: 16px; margin-bottom: 15px;">
                                        ${voiceText.replace(/\n/g, '<br>')}
                                    </div>
                                    ${audioProcessed ? `
                                    <p style="color: #666; font-style: italic;">
                                        🎧 Your personalized voice message is attached to this email. Download and play it to hear your special message!
                                    </p>
                                    ` : `
                                    <p style="color: #666; font-style: italic;">
                                        We encountered an issue with your voice message. Please contact the sender for assistance.
                                    </p>
                                    `}
                                </div>
                            `;
                        } catch (audioError) {
                            console.error('❌ Error processing voice component from combo gift:', audioError.message);
                            comboContent += `
                                <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #28a745; margin: 20px 0;">
                                    <h3 style="color: #28a745; margin-top: 0;">🎵 Voice Message</h3>
                                    <p style="color: #666; font-style: italic;">
                                        We encountered an issue with your voice message. Please contact the sender for assistance.
                                    </p>
                                </div>
                            `;
                        }
                    }
                    
                    // Handle video component
                    if (generatedContent.components.video) {
                        const videoComponent = generatedContent.components.video;
                        let videoUrl = videoComponent.videoUrl || videoComponent.url;
                        
                        if (videoUrl && validateUrl(videoUrl)) {
                            comboContent += `
                                <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #6366f1; margin: 20px 0;">
                                    <h3 style="color: #6366f1; margin-top: 0;">🎥 Video Tribute</h3>
                                    <div style="text-align: center; margin: 20px 0;">
                                        <div style="background: #fff; padding: 20px; border-radius: 10px; border: 2px solid #6366f1;">
                                            <p style="color: #666; margin: 0 0 15px 0;">Your personalized video tribute is ready!</p>
                                            <a href="${videoUrl}" target="_blank" style="background: #6366f1; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
                                                🎥 Watch Your Video
                                            </a>
                                        </div>
                                    </div>
                                    <p style="color: #666; font-style: italic; text-align: center;">
                                        🎥 This video tribute was specially created just for you!
                                    </p>
                                    ${videoComponent.script ? `
                                    <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-top: 15px;">
                                        <h4 style="color: #0369a1; margin-top: 0;">📝 Video Script</h4>
                                        <p style="color: #333; font-size: 14px; line-height: 1.6;">
                                            ${videoComponent.script.replace(/\n/g, '<br>')}
                                        </p>
                                    </div>
                                    ` : ''}
                                </div>
                            `;
                        }
                    }
                }
                
                if (comboContent || comboAttachments.length > 0) {
                    giftContent = comboContent;
                    attachments = comboAttachments;
                } else {
                    console.error('❌ No valid components found for combo gift');
                    giftContent = `
                        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; border-left: 4px solid #6f42c1; margin: 20px 0;">
                            <h3 style="color: #6f42c1; margin-top: 0;">🎁 Your Custom Gift</h3>
                            <p style="color: #666; text-align: center;">
                                We encountered an issue with your combo gift content. Please contact the sender for assistance.
                            </p>
                        </div>
                    `;
                }
                break;
        }
        
        const mailOptions = {
            from: `${process.env.FROM_NAME || 'Wispwish Team'} <${process.env.FROM_EMAIL || 'trickyboy467@gmail.com'}>`,
            to: deliveryEmail,
            subject: `🎁 Your ${giftType.charAt(0).toUpperCase() + giftType.slice(1)} Gift from ${senderName || 'Someone Special'}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                    <div style="background: linear-gradient(135deg, #ff9f43 0%, #f76b1c 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">Your Gift is Here! 🎁</h1>
                        <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">From ${senderName || 'Someone Special'}</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <h2 style="color: #333; margin-top: 0;">Hi ${recipientName || 'Friend'}! 🎉</h2>
                        
                        <p style="color: #666; font-size: 16px; line-height: 1.6;">
                            ${senderName || 'Someone Special'} has sent you a personalized gift! Here's what they said:
                        </p>
                        
                        <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin: 25px 0;">
                            <h3 style="color: #333; margin-top: 0; border-bottom: 2px solid #ff9f43; padding-bottom: 10px;">💌 Sender's Message</h3>
                            <div style="font-style: italic; color: #333; line-height: 1.8; font-size: 16px; white-space: pre-line;">
                                ${senderMessage || 'No message provided'}
                            </div>
                        </div>
                        
                        ${giftContent}
                        
                        <div style="background: #e3f2fd; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #2196f3;">
                            <h4 style="color: #1976d2; margin-top: 0;">💌 Occasion</h4>
                            <p style="color: #666; margin-bottom: 10px;">
                                ${occasion || 'No occasion specified'}
                            </p>
                        </div>
                        
                        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
                            <p style="color: #666; font-size: 14px; text-align: center; margin-bottom: 10px;">
                                <strong>Need help with your gift?</strong> 
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
    sendPaymentConfirmation,
    sendWishKnotEmail
};