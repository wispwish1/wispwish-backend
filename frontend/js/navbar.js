// Navbar initializer for pages that inject navbar.html dynamically
window.initNavbar = function initNavbar() {
  const menuToggle = document.getElementById('menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  if (!menuToggle || !mobileMenu) return;

  // Start closed
  mobileMenu.style.display = 'none';

  menuToggle.onclick = function () {
    const isOpen = mobileMenu.style.display === 'block';
    mobileMenu.style.display = isOpen ? 'none' : 'block';
    menuToggle.innerHTML = isOpen
      ? `<svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <line x1="3" y1="6" x2="21" y2="6"></line>
           <line x1="3" y1="12" x2="21" y2="12"></line>
           <line x1="3" y1="18" x2="21" y2="18"></line>
         </svg>`
      : `<svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <line x1="18" y1="6" x2="6" y2="18"></line>
           <line x1="6" y1="6" x2="18" y2="18"></line>
         </svg>`;
  };

  // Close on link click
  const mobileLinks = document.querySelectorAll('.mobile-nav-link');
  mobileLinks.forEach(link => {
    link.addEventListener('click', function () {
      mobileMenu.style.display = 'none';
      menuToggle.innerHTML = `<svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                 <line x1="3" y1="6" x2="21" y2="6"></line>
                                 <line x1="3" y1="12" x2="21" y2="12"></line>
                                 <line x1="3" y1="18" x2="21" y2="18"></line>
                               </svg>`;
    });
  });

  // Active link state
  (function setActiveLink() {
    let currentUrl = window.location.href;
    if (currentUrl.endsWith('/')) currentUrl = currentUrl.slice(0, -1);
    const allLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');
    allLinks.forEach(link => {
      const linkHref = link.getAttribute('href');
      if (linkHref === '/') {
        const baseUrl = window.location.protocol + '//' + window.location.host;
        if (currentUrl === baseUrl || currentUrl === baseUrl + '/index.html') link.classList.add('active');
        else link.classList.remove('active');
      } else {
        if (currentUrl.includes(linkHref)) link.classList.add('active');
        else link.classList.remove('active');
      }
    });
  })();

  // Auth state management
  (function renderAuthActions() {
    const defaultBackendHost = window.BACKEND_BASE_URL ||
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5001'
        : 'https://wispwish-backend.vercel.app');
    const token = localStorage.getItem('token');
    const desktopAuth = document.getElementById('auth-actions');
    const mobileAuth = document.getElementById('mobile-auth-actions');
    if (!desktopAuth && !mobileAuth) return;

    function setLoggedOut() {
      if (desktopAuth) desktopAuth.innerHTML = `
        <a href="/login.html" class="nav-link" style="background:#fdf2f8;">Login</a>
      `;
      if (mobileAuth) mobileAuth.innerHTML = `
        <a href="/login.html" class="mobile-nav-link" style="flex:1; text-align:center;">Login</a>
      `;
    }

    function setLoggedIn() {
      const htmlDesktop = `
        <div class="flex items-center gap-3">
          <a href="/account.html" class="nav-link" style="background:#ecfeff;color:#036666;">My Account</a>
        </div>
      `;
      const htmlMobile = `
        <div class="flex flex-col gap-2 w-full">
          <a href="/account.html" class="mobile-nav-link" style="background:#ecfeff;color:#036666;">My Account</a>
        </div>
      `;
      if (desktopAuth) desktopAuth.innerHTML = htmlDesktop;
      if (mobileAuth) mobileAuth.innerHTML = htmlMobile;
    }

    function logout() {
      localStorage.removeItem('token');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userName');
      localStorage.removeItem('userId');
      localStorage.removeItem('userPlan');
      window.location.href = '/login.html';
    }

    if (!token) {
      setLoggedOut();
      return;
    }

    // If token exists, show logged in state immediately for better UX
    // Then verify with backend in background
    setLoggedIn();

    // Verify token with backend (but don't change UI if it fails)
    fetch(`${defaultBackendHost}/api/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const user = data && data.user ? data.user : null;
        if (!user) {
          // Token is invalid, update UI to logged out
          setLoggedOut();
          return;
        }
        // Token is valid, user is already logged in
        console.log('Navbar: User authenticated successfully');
      })
      .catch((err) => {
        // Backend check failed, but keep logged in state if token exists
        // This prevents UI flickering when backend is temporarily unavailable
        console.log('Navbar: Backend auth check failed, keeping logged in state', err);
      });
  })();
};


