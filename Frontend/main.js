// Modern Header Scroll Effect
window.addEventListener('scroll', function() {
  const header = document.getElementById('mainHeader');
  if (window.scrollY > 50) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }
});

// Mobile Menu Toggle
document.addEventListener('DOMContentLoaded', function() {
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const nav = document.querySelector('nav');
  
  mobileMenuBtn.addEventListener('click', function() {
    nav.style.display = nav.style.display === 'flex' ? 'none' : 'flex';
    mobileMenuBtn.innerHTML = nav.style.display === 'flex' ? 
      '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
  });

  // Responsive adjustments
  function handleResize() {
    if (window.innerWidth > 768) {
      nav.style.display = 'flex';
    } else {
      nav.style.display = 'none';
      mobileMenuBtn.innerHTML = '<i class="fas fa-bars"></i>';
    }
  }
  
  window.addEventListener('resize', handleResize);
  handleResize();
});

// Animate elements when scrolling
const animateOnScroll = function() {
  const elements = document.querySelectorAll('.animate-on-scroll');
  
  elements.forEach(element => {
    const elementPosition = element.getBoundingClientRect().top;
    const screenPosition = window.innerHeight / 1.3;
    
    if (elementPosition < screenPosition) {
      element.classList.add('animated');
    }
  });
};

window.addEventListener('scroll', animateOnScroll);

// Idle timeout for auto-logout (30 minutes) only if logged in
let idleTimeout;
const IDLE_TIME = 30 * 60 * 1000; // 30 minutes in milliseconds

function resetIdleTimer() {
    if (!sessionStorage.getItem('token')) return; // Only reset if token exists
    
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
        sessionStorage.removeItem('token');
        alert('Session expired due to inactivity. Please log in again.');
        window.location.href = 'http://127.0.0.1:5500/Frontend/login.html';
    }, IDLE_TIME);
}

// Events to reset timer
['mousemove', 'keydown', 'scroll', 'touchstart'].forEach(event => {
    window.addEventListener(event, resetIdleTimer);
});

// Initial call on load - only if user is logged in
if (sessionStorage.getItem('token')) {
    resetIdleTimer();
}