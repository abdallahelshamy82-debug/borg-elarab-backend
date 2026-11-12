const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const storeController = require('../controllers/storeController');
const paymentController = require('../controllers/paymentController');
const adminController = require('../controllers/adminController');
const upload = require('../middleware/upload');
const { User } = require('../models');

/**
 * Ensures the user has an active session and syncs fresh balance/role/status from DB.
 */
const requireAuth = async (req, res, next) => {
    if (!req.session || !req.session.user || !req.session.user.id) {
        if (req.session) req.session.error = "Please login first.";
        return res.redirect('/login');
    }

    try {
        const dbUser = await User.findByPk(req.session.user.id);
        if (!dbUser) {
            req.session = null;
            return res.redirect('/login');
        }
        if (!dbUser.is_active) {
            req.session = { error: "Your account has been suspended. Please contact the administrator." };
            return res.redirect('/login');
        }

        req.currentUser = dbUser;
        req.session.user = {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            role: dbUser.role,
            is_admin: dbUser.is_admin,
            balance: dbUser.balance,
            avatar_url: dbUser.avatar_url
        };
        res.locals.user = req.session.user;
        next();
    } catch (error) {
        console.error('Auth verification error:', error);
        next(error);
    }
};

/**
 * Allows admins and doctors (for course/material management).
 */
const requireAdminOrDoctor = async (req, res, next) => {
    await requireAuth(req, res, () => {
        const u = req.session.user;
        if (u.role !== 'admin' && u.role !== 'doctor' && !u.is_admin) {
            req.session.error = "Unauthorized access.";
            return res.redirect('/store/ds');
        }
        next();
    });
};

/**
 * Restricts sensitive user, wallet, and password controls strictly to Admins.
 */
const requireAdmin = async (req, res, next) => {
    await requireAuth(req, res, () => {
        const u = req.session.user;
        if (u.role !== 'admin' && !u.is_admin) {
            req.session.error = "Administrator privileges required.";
            return res.redirect('/admin/dashboard');
        }
        next();
    });
};

// Home & Landing & Auth
router.get('/', authController.showLogin);
router.get('/login', authController.showLogin);
router.post('/login', authController.login);
router.get('/logout', authController.logout);
router.post('/logout', authController.logout);
router.get('/sso', authController.ssoLogin);

// Protected Student Routes
router.get('/home', requireAuth, (req, res) => res.render('home'));
router.post('/profile/update', requireAuth, upload.single('avatar'), authController.updateProfile);
router.post('/profile/password', requireAuth, authController.updatePassword);

// Store Routes
router.get('/store/ps', requireAuth, storeController.showStore);
router.get('/store/ds', requireAuth, storeController.showDashboard);
router.post('/store/purchase/:id', requireAuth, storeController.purchaseItem);

// Payment Routes (Callback stays public because Paymob HMAC authenticates it directly)
router.get('/recharge', requireAuth, paymentController.showRecharge);
router.post('/payment/initiate', requireAuth, paymentController.initiatePayment);
router.get('/payment/callback', paymentController.callback);
router.post('/payment/callback', paymentController.webhookCallback);

// Course Management Routes (Admin + Doctor)
router.get('/admin/dashboard', requireAdminOrDoctor, adminController.dashboard);
router.post('/admin/courses', requireAdminOrDoctor, upload.fields([{ name: 'cover_image', maxCount: 1 }, { name: 'material_file', maxCount: 1 }]), adminController.storeCourse);
router.post('/admin/delete-item/:id', requireAdminOrDoctor, adminController.deleteItem);

// User & Wallet Management Routes (Admin Only)
router.get('/admin/users', requireAdmin, adminController.userLookup);
router.post('/admin/users/:id/points', requireAdmin, adminController.adjustPoints);
router.post('/admin/users/:id/password', requireAdmin, adminController.resetPassword);
router.post('/admin/users/:id/toggle-status', requireAdmin, adminController.toggleUserStatus);

module.exports = router;
