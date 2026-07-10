/**
 * WispWish Chatbot Widget
 * AI-powered chat assistant for the WispWish platform
 */

class WispWishChatbot {
    constructor() {
        this.isOpen = false;
        this.threadId = null;
        this.isLoading = false;
        this.API_BASE = this.getApiBase();

        this.init();
    }

    getApiBase() {
        // Auto-detect API base URL
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'https://wispwish-backend.vercel.app';
        } else {
            // On production, we assume the API is at the same origin under /api
            // return window.location.origin;
            return 'https://wispwish-backend.vercel.app';
        }
    }

    init() {
        this.createWidget();
        this.attachEventListeners();
        console.log('✨ WispWish Chatbot initialized');
    }

    createWidget() {
        // Create toggle button
        const toggle = document.createElement('button');
        toggle.className = 'wispwish-chat-toggle';
        toggle.id = 'wispwish-chat-toggle';
        toggle.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/>
        <path d="M7 9h10v2H7zm0-3h10v2H7zm0 6h7v2H7z"/>
      </svg>
    `;
        toggle.setAttribute('aria-label', 'Open chat');
        toggle.setAttribute('title', 'Chat with us');

        // Create chat widget
        const widget = document.createElement('div');
        widget.className = 'wispwish-chat-widget';
        widget.id = 'wispwish-chat-widget';
        widget.innerHTML = `
      <div class="wispwish-chat-header">
        <div class="wispwish-chat-header-info">
          <div class="wispwish-chat-avatar">🎁</div>
          <div class="wispwish-chat-title">
            <h3>WispWish Assistant</h3>
            <p>Online • Here to help</p>
          </div>
        </div>
        <button class="wispwish-chat-close" id="wispwish-chat-close" aria-label="Close chat">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <div class="wispwish-chat-messages" id="wispwish-chat-messages">
        <div class="wispwish-welcome">
          <div class="wispwish-welcome-icon">🎁</div>
          <p style="color: #6b7280; margin: 0;">Ask me anything about WispWish!</p>
        </div>
      </div>
      
      <div class="wispwish-suggestions" id="wispwish-suggestions">
        <button class="wispwish-suggestion" data-message="What gift types are available?">Gift types</button>
        <button class="wispwish-suggestion" data-message="How much do gifts cost?">Pricing</button>
        <button class="wispwish-suggestion" data-message="How does it work?">How it works</button>
        <button class="wispwish-suggestion" data-message="What is a WishKnot?">WishKnot?</button>
      </div>
      
      <div class="wispwish-chat-input-area">
        <input 
          type="text" 
          class="wispwish-chat-input" 
          id="wispwish-chat-input" 
          placeholder="Type your message..."
          autocomplete="off"
        />
        <button class="wispwish-chat-send" id="wispwish-chat-send" aria-label="Send message">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    `;

        document.body.appendChild(toggle);
        document.body.appendChild(widget);

        // Store references
        this.toggleBtn = toggle;
        this.widget = widget;
        this.messagesContainer = document.getElementById('wispwish-chat-messages');
        this.input = document.getElementById('wispwish-chat-input');
        this.sendBtn = document.getElementById('wispwish-chat-send');
        this.suggestionsContainer = document.getElementById('wispwish-suggestions');
    }

    attachEventListeners() {
        // Toggle button
        this.toggleBtn.addEventListener('click', () => this.toggle());

        // Close button
        document.getElementById('wispwish-chat-close').addEventListener('click', () => this.close());

        // Send button
        this.sendBtn.addEventListener('click', () => this.sendMessage());

        // Input enter key
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Suggestion buttons
        this.suggestionsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('wispwish-suggestion')) {
                const message = e.target.dataset.message;
                if (message) {
                    this.input.value = message;
                    this.sendMessage();
                }
            }
        });

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    async open() {
        this.isOpen = true;
        this.widget.classList.add('open');
        this.toggleBtn.classList.add('open');
        this.input.focus();

        // Initialize chat session if needed
        if (!this.threadId) {
            await this.initializeChat();
        }
    }

    close() {
        this.isOpen = false;
        this.widget.classList.remove('open');
        this.toggleBtn.classList.remove('open');
    }

    async initializeChat() {
        try {
            const response = await fetch(`${this.API_BASE}/api/chat/init`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();

            if (data.success) {
                this.threadId = data.threadId;
                this.addMessage(data.welcomeMessage, 'bot');
            }
        } catch (error) {
            console.error('Failed to initialize chat:', error);
            this.addMessage("👋 Hi! I'm having trouble connecting. Please try again in a moment.", 'bot');
        }
    }

    async sendMessage() {
        const message = this.input.value.trim();
        if (!message || this.isLoading) return;

        // Clear input
        this.input.value = '';

        // Add user message
        this.addMessage(message, 'user');

        // Clear welcome message if exists
        const welcome = this.messagesContainer.querySelector('.wispwish-welcome');
        if (welcome) welcome.remove();

        // Show typing indicator
        this.showTyping();
        this.isLoading = true;
        this.sendBtn.disabled = true;

        try {
            const response = await fetch(`${this.API_BASE}/api/chat/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    threadId: this.threadId,
                    message: message
                })
            });

            const data = await response.json();

            this.hideTyping();
            this.isLoading = false;
            this.sendBtn.disabled = false;

            if (data.success) {
                this.threadId = data.threadId;
                this.addMessage(data.response, 'bot');

                // Update suggestions
                if (data.suggestions && data.suggestions.length > 0) {
                    this.updateSuggestions(data.suggestions);
                }
            } else {
                this.addMessage(data.fallbackResponse || "Sorry, I couldn't process that. Please try again!", 'bot', true);
            }
        } catch (error) {
            console.error('Failed to send message:', error);
            this.hideTyping();
            this.isLoading = false;
            this.sendBtn.disabled = false;
            this.addMessage("I'm having trouble connecting. Please check your internet and try again.", 'bot', true);
        }
    }

    addMessage(text, sender, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `wispwish-message ${sender}${isError ? ' error' : ''}`;

        // Convert markdown-like formatting to HTML
        let formattedText = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');

        messageDiv.innerHTML = formattedText;

        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    showTyping() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'wispwish-typing';
        typingDiv.id = 'wispwish-typing';
        typingDiv.innerHTML = `
      <div class="wispwish-typing-dot"></div>
      <div class="wispwish-typing-dot"></div>
      <div class="wispwish-typing-dot"></div>
    `;
        this.messagesContainer.appendChild(typingDiv);
        this.scrollToBottom();
    }

    hideTyping() {
        const typing = document.getElementById('wispwish-typing');
        if (typing) typing.remove();
    }

    updateSuggestions(suggestions) {
        this.suggestionsContainer.innerHTML = suggestions
            .map(s => `<button class="wispwish-suggestion" data-message="${s}">${s}</button>`)
            .join('');
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.wispwishChatbot = new WispWishChatbot();
    });
} else {
    window.wispwishChatbot = new WispWishChatbot();
}
