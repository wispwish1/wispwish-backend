// Main JavaScript for WispWish
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the application
    initApp();

    // Setup event listeners
    setupEventListeners();
});

// Initialize the application
async function initApp() {
    // Load FAQs if on homepage
    await loadFAQs();
    
    // Check if user is logged in
    await checkUserAuth();
    
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Setup event listeners
function setupEventListeners() {
    // Get Started button
    const getStartedButtons = document.querySelectorAll('.get-started-btn');
    getStartedButtons.forEach(button => {
        button.addEventListener('click', function() {
            window.location.href = '/giftgenerator.html';
        });
    });

    // Login/Signup buttons
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', function() {
            window.location.href = '/login.html';
        });
    }

    const signupBtn = document.getElementById('signup-btn');
    if (signupBtn) {
        signupBtn.addEventListener('click', function() {
            window.location.href = '/signup.html';
        });
    }

    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    
    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', function() {
            mobileMenu.classList.toggle('hidden');
        });
    }
}

// Load FAQs from API
async function loadFAQs() {
    const faqContainer = document.getElementById('faq-container');
    if (!faqContainer) return;

    try {
        // Show loading state
        faqContainer.innerHTML = '<div class="text-center py-8"><div class="loading-spinner inline-block w-8 h-8 border-4 border-pink-300 rounded-full"></div><p class="mt-2 text-gray-600">Loading FAQs...</p></div>';

        // Fetch FAQs from API
        const response = await API.content.getFAQs();
        
        if (response.success && response.data) {
            // Clear loading state
            faqContainer.innerHTML = '';
            
            // Create FAQ items
            response.data.forEach(faq => {
                const faqItem = createFAQItem(faq);
                faqContainer.appendChild(faqItem);
            });
        } else {
            faqContainer.innerHTML = '<p class="text-red-500 text-center py-4">Failed to load FAQs. Please try again later.</p>';
        }
    } catch (error) {
        console.error('Error loading FAQs:', error);
        faqContainer.innerHTML = '<p class="text-red-500 text-center py-4">An error occurred. Please try again later.</p>';
    }
}

// Create FAQ item
function createFAQItem(faq) {
    const item = document.createElement('div');
    item.className = 'faq-item border-b border-gray-200 py-4';
    
    item.innerHTML = `
        <button class="faq-question w-full text-left font-medium flex justify-between items-center">
            <span>${faq.question}</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 transform transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
        </button>
        <div class="faq-answer mt-2 text-gray-600 hidden">
            ${faq.answer}
        </div>
    `;
    
    // Add click event to toggle answer
    const questionBtn = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');
    const icon = questionBtn.querySelector('svg');
    
    questionBtn.addEventListener('click', function() {
        answer.classList.toggle('hidden');
        icon.classList.toggle('rotate-180');
    });
    
    return item;
}

// Check if user is logged in
async function checkUserAuth() {
    try {
        // Check if API object exists, if not skip auth check
        if (typeof API === 'undefined' || !API || !API.auth) {
            // API not available, skip auth check
            return;
        }
        
        const response = await API.auth.getCurrentUser();
        
        const authButtons = document.getElementById('auth-buttons');
        const userMenu = document.getElementById('user-menu');
        
        if (response.success && response.data) {
            // User is logged in
            if (authButtons) authButtons.classList.add('hidden');
            if (userMenu) {
                userMenu.classList.remove('hidden');
                
                // Set user name
                const userNameElement = document.getElementById('user-name');
                if (userNameElement) {
                    userNameElement.textContent = response.data.name;
                }
                
                // Setup logout button
                const logoutBtn = document.getElementById('logout-btn');
                if (logoutBtn) {
                    logoutBtn.addEventListener('click', async function() {
                        if (API && API.auth && API.auth.logout) {
                            await API.auth.logout();
                        }
                        window.location.reload();
                    });
                }
            }
        } else {
            // User is not logged in
            if (authButtons) authButtons.classList.remove('hidden');
            if (userMenu) userMenu.classList.add('hidden');
        }
    } catch (error) {
        // Silently fail if API is not available
        if (error.message && !error.message.includes('API is not defined')) {
            console.error('Error checking auth status:', error);
        }
    }
}