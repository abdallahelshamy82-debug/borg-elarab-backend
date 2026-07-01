const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { User } = require('../models');
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'dwd-it2-92aa4'
    });
}

exports.showLogin = (req, res) => {
    res.render('login');
};

exports.login = async (req, res) => {
    let { email, password } = req.body;
    
    // Automatically strip domain if the user types it out of habit
    const studentId = email.split('@')[0];
    email = studentId;

    try {
        const user = await User.findOne({ where: { email } });
        
        if (user && await bcrypt.compare(password, user.password)) {
            if (!user.is_active) {
                req.session.error = 'Your account has been suspended. Please contact the administrator.';
                return res.redirect('/');
            }

            // Setup session
            req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                is_admin: user.is_admin,
                balance: user.balance
            };

            if (user.is_admin || user.role === 'doctor') {
                return res.redirect('/admin/dashboard');
            }
            return res.redirect('/home');
        }

        req.session.error = 'The provided credentials do not match our records.';
        res.redirect('/');
    } catch (error) {
        console.error(error);
        req.session.error = 'An error occurred during login.';
        res.redirect('/');
    }
};

exports.ssoLogin = async (req, res) => {
    const { token, redirect } = req.query;

    if (!token) {
        return res.status(400).send('Missing SSO token');
    }

    try {
        // 1. Verify Firebase ID Token
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        // Extract basic info from the token
        const email = decodedToken.email;
        let name = decodedToken.name || decodedToken.email.split('@')[0];
        
        // Firebase Auth doesn't store role in standard claims by default unless set as custom claims.
        // We will assume "student" by default if it's not present, unless the email matches admin.
        let role = decodedToken.role || 'student';
        
        if (email === 'admin@borg.com' || email.includes('admin')) {
            role = 'admin';
        }

        // 2. Auto-sync user in our DB
        let user = await User.findOne({ where: { email } });
        
        if (!user) {
            const randomPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
            user = await User.create({
                email: email,
                name: name,
                role: role,
                is_admin: role === 'admin',
                password: randomPassword
            });
        } else {
            // Update name and role if custom claims were provided in the token
            if (decodedToken.role || decodedToken.name) {
                await user.update({ 
                    name: decodedToken.name ? decodedToken.name : user.name, 
                    role: decodedToken.role ? decodedToken.role : user.role, 
                    is_admin: (decodedToken.role || user.role) === 'admin' 
                });
            }
        }

        // 3. Log the user in securely
        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            is_admin: user.is_admin,
            balance: user.balance
        };

        // 4. Redirect to specific page if requested
        if (redirect) {
            // Basic security check to prevent open redirects
            if (redirect.startsWith('/')) {
                return res.redirect(redirect);
            }
        }

        // 5. Default Redirect based on role
        if (user.is_admin || user.role === 'doctor') {
            return res.redirect('/admin/dashboard');
        }
        return res.redirect('/home');
        
    } catch (error) {
        console.error('SSO Token Verification Failed:', error);
        res.status(401).send('Invalid or Expired SSO Token');
    }
};

exports.updateProfile = async (req, res) => {
    const { name } = req.body;
    try {
        await User.update({ name }, { where: { id: req.session.user.id } });
        req.session.user.name = name;
        req.session.success = 'Profile updated successfully.';
        res.redirect('back');
    } catch (error) {
        req.session.error = 'Failed to update profile.';
        res.redirect('back');
    }
};

exports.updatePassword = async (req, res) => {
    const { current_password, new_password, new_password_confirmation } = req.body;
    
    if (new_password !== new_password_confirmation) {
        req.session.error = 'New passwords do not match.';
        return res.redirect('back');
    }

    if (new_password.length < 4) {
        req.session.error = 'Password must be at least 4 characters long.';
        return res.redirect('back');
    }

    try {
        const user = await User.findByPk(req.session.user.id);
        
        if (!await bcrypt.compare(current_password, user.password)) {
            req.session.error = 'Current password does not match.';
            return res.redirect('back');
        }

        const hashed = await bcrypt.hash(new_password, 10);
        await user.update({ password: hashed });
        
        req.session.success = 'Password updated successfully.';
        res.redirect('back');
    } catch (error) {
        req.session.error = 'Failed to update password.';
        res.redirect('back');
    }
};

exports.logout = (req, res) => {
    req.session = null;
    res.redirect('/');
};
