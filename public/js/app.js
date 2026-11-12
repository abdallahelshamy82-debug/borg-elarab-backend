(function () {
    // Global toast utility
    window.showToast = function (message, type) {
        var container = document.getElementById('toast-container');
        if (!container) return;
        var toast = document.createElement('div');
        toast.className = 'toast ' + (type || 'success');
        var span = document.createElement('span');
        span.textContent = message;
        toast.appendChild(span);
        container.appendChild(toast);

        requestAnimationFrame(function () {
            toast.classList.add('show');
        });

        setTimeout(function () {
            toast.classList.remove('show');
            setTimeout(function () {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 260);
        }, 3500);
    };

    // Mobile drawer controls
    var hamburger = document.getElementById('hamburgerMenu');
    var drawer = document.getElementById('mobileDrawer');
    var backdrop = document.getElementById('drawerBackdrop');
    var closeBtn = document.getElementById('drawerCloseBtn');

    function setDrawerOpen(isOpen) {
        if (!drawer || !backdrop) return;
        drawer.classList.toggle('active', isOpen);
        backdrop.classList.toggle('active', isOpen);
        if (hamburger) {
            hamburger.classList.toggle('active', isOpen);
            hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
        document.body.style.overflow = isOpen ? 'hidden' : '';
    }

    if (hamburger) {
        hamburger.addEventListener('click', function () {
            var isOpen = drawer && drawer.classList.contains('active');
            setDrawerOpen(!isOpen);
        });
    }
    if (closeBtn) closeBtn.addEventListener('click', function () { setDrawerOpen(false); });
    if (backdrop) closeBtn.addEventListener('click', function () { setDrawerOpen(false); });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            setDrawerOpen(false);
            document.querySelectorAll('.modal-overlay.active').forEach(function (m) {
                m.classList.remove('active');
            });
        }
    });

    // Close modals when clicking on overlay backdrop
    document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });

    // Password visibility toggle buttons
    document.querySelectorAll('[data-toggle-password]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var input = document.getElementById(btn.getAttribute('data-toggle-password'));
            if (!input) return;
            var isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            btn.textContent = isHidden ? 'Hide' : 'Show';
        });
    });

    // Restore submit buttons if user navigates back via browser bfcache
    window.addEventListener('pageshow', function () {
        document.querySelectorAll('.btn.loading').forEach(function (btn) {
            btn.classList.remove('loading');
            btn.disabled = false;
            var label = btn.querySelector('.btn-label');
            var orig = btn.getAttribute('data-original-label');
            if (label && orig) label.textContent = orig;
        });
    });

    // Basic context-menu & devtools shortcut guard
    document.addEventListener('contextmenu', function (event) {
        event.preventDefault();
    });
    document.addEventListener('keydown', function (event) {
        if (event.keyCode === 123) event.preventDefault();
        if (event.ctrlKey && event.shiftKey && (event.keyCode === 73 || event.keyCode === 74)) event.preventDefault();
        if (event.ctrlKey && event.keyCode === 85) event.preventDefault();
    });
})();
