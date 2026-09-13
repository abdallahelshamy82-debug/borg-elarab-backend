const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const storeController = require('../controllers/storeController');
const paymentController = require('../controllers/paymentController');
const adminController = require('../controllers/adminController');
const upload = require('../middleware/upload');

// Middleware to protect routes
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        req.session.error = "Please login first.";
        return res.redirect('/login');
    }
    next();
};

const requireAdminOrDoctor = (req, res, next) => {
    if (!req.session || !req.session.user) {
        req.session.error = "Please login first.";
        return res.redirect('/login');
    }
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'doctor' && !req.session.user.is_admin) {
        req.session.error = "Unauthorized access.";
        return res.redirect('/store/ds');
    }
    next();
};

// Home & Landing & Auth
router.get('/', authController.showLogin);
router.get('/login', authController.showLogin);
router.post('/login', authController.login);
router.get('/logout', authController.logout);
router.post('/logout', authController.logout);
router.get('/sso', authController.ssoLogin);

// Import Controllers
// Protected Routes
router.get('/home', requireAuth, (req, res) => res.render('home'));
router.post('/profile/update', requireAuth, upload.single('avatar'), authController.updateProfile);
router.post('/profile/password', requireAuth, authController.updatePassword);

// Store Routes
router.get('/store/ps', requireAuth, storeController.showStore);
router.get('/store/ds', requireAuth, storeController.showDashboard);
router.post('/store/purchase/:id', requireAuth, storeController.purchaseItem);

// Payment Routes
router.get('/recharge', requireAuth, paymentController.showRecharge);
router.post('/payment/initiate', requireAuth, paymentController.initiatePayment);
router.get('/payment/callback', requireAuth, paymentController.callback);

// Admin Routes
router.get('/admin/dashboard', requireAdminOrDoctor, adminController.dashboard);
router.get('/admin/users', requireAdminOrDoctor, adminController.userLookup);
router.post('/admin/users/:id/points', requireAdminOrDoctor, adminController.adjustPoints);
router.post('/admin/courses', requireAdminOrDoctor, upload.fields([{ name: 'cover_image', maxCount: 1 }, { name: 'material_file', maxCount: 1 }]), adminController.storeCourse);
router.post('/admin/delete-item/:id', requireAdminOrDoctor, adminController.deleteItem);

module.exports = router;
