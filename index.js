require('dotenv').config();
const express = require('express');
const session = require('cookie-session'); // Use cookie-session for Vercel serverless compatibility
const path = require('path');

const app = express();

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
if (process.env.VERCEL === '1') {
    app.use('/uploads', express.static('/tmp/uploads'));
} else {
    app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
}

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Disable Caching for Dynamic Routes to prevent session UI bugs
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});


// Session
app.use(session({
    name: 'session',
    secret: process.env.SESSION_SECRET || 'secret',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

// Set user in locals for EJS templates
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.success = req.session.success || null;
    res.locals.error = req.session.error || null;
    delete req.session.success;
    delete req.session.error;
    next();
});

// Import Routes
const webRoutes = require('./routes/web');
app.use('/', webRoutes);

// Server start (local testing)
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

// Export app for Vercel Serverless
module.exports = app;
