/**
 * Wispwish Centralized Configuration
 * Automatically detects environment and set appropriate URLs
 */
const LIVE_BACKEND_API_URL = 'https://wispwish-backend.vercel.app/api';

const CONFIG = {
    // API Base URL detection
    get API_BASE_URL() {
        const overrideUrl = window.BACKEND_API_URL || window.API_BASE_URL;
        if (overrideUrl) {
            const normalizedUrl = overrideUrl.replace(/\/$/, '');
            return normalizedUrl.endsWith('/api') ? normalizedUrl : `${normalizedUrl}/api`;
        }

        const isLocal = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1';

        if (isLocal) {
            return 'http://localhost:5001/api';
        } else {
            return LIVE_BACKEND_API_URL;
        }
    },

    // Redirection utility
    redirects: {
        login: (redirectPath = '') => {
            const baseUrl = '/login.html';
            return redirectPath ? `${baseUrl}?redirect=${encodeURIComponent(redirectPath)}` : baseUrl;
        },
        admin: '/admin-portal/index.html',
        home: '/',
        dashboard: '/dashboard.html'
    }
};

// Global expose
window.CONFIG = CONFIG;
