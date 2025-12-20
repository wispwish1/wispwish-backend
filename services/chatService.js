import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ChatService {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        this.assistantId = process.env.OPENAI_ASSISTANT_ID || null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Check if we have existing assistant
            if (this.assistantId) {
                try {
                    await this.openai.beta.assistants.retrieve(this.assistantId);
                    this.initialized = true;
                    console.log('✅ Chat service initialized with existing assistant');
                    return;
                } catch (e) {
                    console.log('⚠️ Existing assistant not found, creating new one...');
                }
            }

            // Create assistant with knowledge embedded in instructions
            console.log('🤖 Creating assistant...');
            const assistant = await this.openai.beta.assistants.create({
                name: 'WispWish Support Assistant',
                instructions: `You are a friendly and helpful support assistant for WispWish, an AI-powered digital gift platform.

Your role is to:
- Help users understand our gift types and their pricing
- Guide them through the gift creation process
- Answer questions about delivery, privacy, payments, and refunds
- Be warm, empathetic, and encouraging

IMPORTANT KNOWLEDGE BASE:

## Gift Types & Pricing (AUD)
- AI Poem / Story: $8 - Heartfelt, AI-crafted message
- Voice Message: $10 - Personalized spoken message + music
- Illustration: $10 - Unique artwork from your story
- Tribute Video: $12 - Full video with voice narration
- AI Song: $10 - Custom song for the occasion
- WishKnot Gift: $9 - Animated ribbon knot with message

## WishKnot
A WishKnot is our signature gift - an animated ribbon knot that carries your message. Based on the ancient idea of storing energy in a knot. When opened, it unties and releases your emotions.

## Combo Package
The Full Experience: $22 (save $4!) - Includes Poem + Voice + Illustration + Video + Music

## Subscription Plans
- Monthly: $15/month - 1 gift per month
- Weekly: $28/month - 1 gift per week (4/month)

## Pay What You Want
For grief and apology gifts: Starting at $5 AUD, no maximum.

## How It Works
1. Choose an Occasion (birthday, love, grief, etc.)
2. Fill Out the Form (recipient details, tone, memories)
3. Pick a Gift Type
4. Get Digital Delivery (2-5 minutes via email/link)

## Delivery & Refunds
- Most gifts ready in 2-5 minutes
- Gifts never expire
- 100% satisfaction guarantee, 7-day refunds
- Secure & private

Keep responses concise (2-4 sentences). Use emojis sparingly.`,
                model: 'gpt-4o-mini'
            });
            this.assistantId = assistant.id;

            console.log('✅ Chat service initialized successfully!');
            console.log(`   Assistant ID: ${this.assistantId}`);
            console.log('\n💡 Add this to your .env file to reuse:');
            console.log(`   OPENAI_ASSISTANT_ID=${this.assistantId}`);

            this.initialized = true;
        } catch (error) {
            console.error('❌ Failed to initialize chat service:', error);
            throw error;
        }
    }

    async createThread() {
        await this.initialize();
        const thread = await this.openai.beta.threads.create();
        console.log('📝 Created thread:', thread.id);
        return thread.id;
    }

    async sendMessage(threadId, message) {
        await this.initialize();

        console.log('📨 Sending message to thread:', threadId);

        // Add message to thread
        await this.openai.beta.threads.messages.create(threadId, {
            role: 'user',
            content: message
        });

        // Create and poll the run (OpenAI v5.x style)
        console.log('🏃 Creating run...');
        const run = await this.openai.beta.threads.runs.createAndPoll(threadId, {
            assistant_id: this.assistantId
        });

        console.log('✅ Run completed with status:', run.status);

        if (run.status !== 'completed') {
            console.error('Run did not complete:', run.status, run.last_error);
            throw new Error(`Run failed with status: ${run.status}`);
        }

        // Get the assistant's response
        const messages = await this.openai.beta.threads.messages.list(threadId);
        const assistantMessage = messages.data.find(m => m.role === 'assistant');

        if (!assistantMessage) {
            throw new Error('No response from assistant');
        }

        // Extract text content
        const textContent = assistantMessage.content.find(c => c.type === 'text');
        if (!textContent) {
            throw new Error('No text content in response');
        }

        // Clean up the response
        let response = textContent.text.value;
        response = response.replace(/【[^】]*】/g, ''); // Remove citation markers

        return response;
    }

    getStatus() {
        return {
            initialized: this.initialized,
            assistantId: this.assistantId
        };
    }
}

// Export singleton instance
const chatService = new ChatService();
export default chatService;
