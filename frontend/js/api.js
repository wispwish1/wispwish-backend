// API Integration for WispWish
const API_BASE_URL = CONFIG.API_BASE_URL;

// API Error Handler
const handleApiError = (error) => {
    console.error('API Error:', error);
    return { success: false, error: error.message || 'Unknown error occurred' };
};

// Authentication APIs
const authAPI = {
    // User Registration
    register: async (userData) => {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(userData)
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    },

    // User Login
    login: async (credentials) => {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(credentials)
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    },

    // User Logout
    logout: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/logout`, {
                method: 'POST',
                credentials: 'include'
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    },

    // Get Current User
    getCurrentUser: async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return { success: false, error: 'No token found' };

            const response = await fetch(`${API_BASE_URL}/auth/me`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    }
};

// Gift APIs
const giftAPI = {
    // Get All Gift Types
    getGiftTypes: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/gift-types`, {
                method: 'GET'
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    },

    // Create a Gift
    createGift: async (giftData) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/gift/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(giftData)
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    },

    // Get User's Gifts
    getUserGifts: async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/gift/user`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    },

    // Get Gift by ID
    getGiftById: async (giftId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/gift/${giftId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    },

    // Get Gift Status
    getGiftStatus: async (giftId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/gift/${giftId}/status`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    }
};

// Payment APIs
const paymentAPI = {
    // Create Stripe Checkout Session
    createCheckoutSession: async (paymentData) => {
        try {
            const response = await fetch(`${API_BASE_URL}/payment/create-checkout-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(paymentData)
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    },

    // Create Payment Intent
    createPaymentIntent: async (paymentData) => {
        try {
            const response = await fetch(`${API_BASE_URL}/payment/create-payment-intent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(paymentData)
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    },

    // Get Payment History
    getPaymentHistory: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/payment/history`, {
                method: 'GET',
                credentials: 'include'
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    },

    // Check payment status
    checkPaymentStatus: async (giftId) => {
        try {
            const response = await fetch(`${API_BASE_URL}/payment/auto-sync/${giftId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    }
};

// Content APIs
const contentAPI = {
    // Get FAQs
    getFAQs: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/content/faqs`, {
                method: 'GET'
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    },

    // Get Voice Styles
    getVoiceStyles: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/content/voice-styles`, {
                method: 'GET'
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    }
};

// Artwork APIs
const artworkAPI = {
    // Get Artwork Templates
    getArtworkTemplates: async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/artwork/templates`, {
                method: 'GET'
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    }
};

// Song APIs
const songAPI = {
    // Generate Song
    generateSong: async (songData) => {
        try {
            const response = await fetch(`${API_BASE_URL}/song/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(songData)
            });
            return await response.json();
        } catch (error) {
            return handleApiError(error);
        }
    }
};

// Export all APIs
const API = {
    auth: authAPI,
    gift: giftAPI,
    payment: paymentAPI,
    content: contentAPI,
    artwork: artworkAPI,
    song: songAPI
};