require('dotenv').config();
const express = require('express');
const session = require('cookie-session'); // Use cookie-session for Vercel serverless compatibility
const path = require('path');

const app = express();
const isProd = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

// Trust Vercel / reverse proxy headers for secure cookies
app.set('trust proxy', 1);

// Static assets & favicon BEFORE session middleware so they never consume flash messages
app.use(express.static(path.join(__dirname, 'public')));
if (process.env.VERCEL === '1') {
    app.use('/uploads', express.static('/tmp/uploads'));
} else {
    app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
}
app.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Disable Caching for Dynamic Routes to prevent stale session UI
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// Session
app.use(session({
    name: 'session',
    secret: process.env.SESSION_SECRET || 'secret',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd
}));

// Set user & flash locals for EJS templates
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.currentPath = req.path;
    res.locals.success = req.session.success || null;
    res.locals.error = req.session.error || null;
    delete req.session.success;
    delete req.session.error;
    next();
});

// Wait for DB sync before serving any dynamic request
const { dbReady } = require('./models');
app.use(async (req, res, next) => {
    try {
        const dbErr = await dbReady;
        if (dbErr) {
            return res.status(503).render('error', {
                statusCode: 503,
                title: 'Database Unavailable',
                message: 'The database connection is temporarily unavailable. Please try again shortly.'
            });
        }
        next();
    } catch (e) {
        res.status(503).type('text/plain').send('Database unavailable: ' + (e.message || e));
    }
});

// Import Routes
try {
    const webRoutes = require('./routes/web');
    app.use('/', webRoutes);
} catch (e) {
    console.error("Critical Startup Error:", e);
    app.use((req, res) => {
        res.status(500).type('text/plain').send("Server Startup Error:\n" + (e.stack || e.message));
    });
}

// 404 Handler
app.use((req, res) => {
    res.status(404).render('error', {
        statusCode: 404,
        title: 'Page Not Found',
        message: 'The page you are looking for does not exist or has been moved.'
    });
});

// Global Error Handler (handles multer upload errors & unexpected exceptions cleanly)
app.use((err, req, res, next) => {
    console.error('Unhandled Request Error:', err);
    if (err && (err.name === 'MulterError' || /allowed|format|upload/i.test(err.message || ''))) {
        if (req.session) {
            req.session.error = err.code === 'LIMIT_FILE_SIZE'
                ? 'Uploaded file exceeds the 15 MB size limit.'
                : err.message;
        }
        const fallbackDest = req.path.startsWith('/admin') ? '/admin/dashboard' : '/store/ds';
        return res.redirect(fallbackDest);
    }

    res.status(500).render('error', {
        statusCode: 500,
        title: 'Internal Server Error',
        message: 'Something went wrong while processing your request. Please try again.'
    });
});

// Server start (local testing)
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

// Export app for Vercel Serverless
module.exports = app;
