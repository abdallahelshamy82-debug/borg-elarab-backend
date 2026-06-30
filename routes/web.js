const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Middleware to protect routes
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        req.session.error = "Please login first.";
        return res.redirect('/');
    }
    next();
};

const requireAdminOrDoctor = (req, res, next) => {
    if (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'doctor')) {
        req.session.error = "Unauthorized access.";
        return res.redirect('/home');
    }
    next();
};

// Home & Landing
router.get('/', authController.showLogin);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/sso', authController.ssoLogin);

// Import Controllers
const storeController = require('../controllers/storeController');
const paymentController = require('../controllers/paymentController');
const adminController = require('../controllers/adminController');

// Protected Routes
router.get('/home', requireAuth, (req, res) => res.render('home'));
router.post('/profile/update', requireAuth, authController.updateProfile);
router.post('/profile/password', requireAuth, authController.updatePassword);

// Store Routes
router.get('/store/ps', requireAuth, storeController.showStore);
router.get('/store/ds', requireAuth, storeController.showDashboard);
router.post('/store/purchase/:id', requireAuth, storeController.purchaseItem);

// Payment Routes
router.get('/recharge', requireAuth, paymentController.showRecharge);
router.post('/payment/initiate', requireAuth, paymentController.initiatePayment);
router.get('/payment/callback', requireAuth, paymentController.mockPaymobCallback);

// Admin Routes
router.get('/admin/dashboard', requireAdminOrDoctor, adminController.dashboard);
router.get('/admin/users', requireAdminOrDoctor, adminController.userLookup);
router.post('/admin/users/:id/points', requireAdminOrDoctor, adminController.adjustPoints);

module.exports = router;
