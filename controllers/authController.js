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
    if (req.session && req.session.user) {
        if (req.session.user.is_admin || req.session.user.role === 'doctor') {
            return res.redirect('/admin/dashboard');
        }
        return res.redirect('/store/ds');
    }
    res.render('login');
};

exports.login = async (req, res) => {
    let { email, password } = req.body;
    email = (email || '').trim();
    password = (password || '').trim();

    try {
        let user = await User.findOne({ where: { email } });
        if (!user && email.includes('@')) {
            user = await User.findOne({ where: { email: email.split('@')[0] } });
        } else if (!user && !email.includes('@')) {
            user = await User.findOne({ where: { email: email + '@btechu.com' } });
        }
        
        if (user && await bcrypt.compare(password, user.password)) {
            if (!user.is_active) {
                req.session.error = 'Your account has been suspended. Please contact the administrator.';
                return res.redirect('/login');
            }

            // Setup session
            req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                is_admin: user.is_admin,
                balance: user.balance,
                avatar_url: user.avatar_url
            };

            if (user.is_admin || user.role === 'doctor') {
                return res.redirect('/admin/dashboard');
            }
            return res.redirect('/store/ds');
        }

        req.session.error = 'The provided credentials do not match our records.';
        res.redirect('/login');
    } catch (error) {
        console.error(error);
        req.session.error = 'An error occurred during login.';
        res.redirect('/login');
    }
};

exports.ssoLogin = async (req, res) => {
    const { token, batu_token, redirect } = req.query;

    if (!token && !batu_token) {
        return res.status(400).send('No authentication token provided');
    }

    try {
        let email, name, role;

        if (batu_token) {
            // ── BATU Student Authentication ──
            const secret = process.env.BATU_SSO_SECRET || 'BorgElArabSecret2026';
            const parts = batu_token.split('.');
            if (parts.length !== 2) return res.status(401).send("Invalid BATU Token format");
            
            const [payloadBase64, signature] = parts;
            const expectedSignature = crypto.createHmac('sha256', secret).update(payloadBase64).digest('hex');
            
            if (signature !== expectedSignature) {
                return res.status(401).send("Invalid BATU Token signature");
            }
            
            const payloadData = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'));
            
            if (Date.now() > payloadData.exp) {
                return res.status(401).send("BATU Token expired");
            }
            
            email = payloadData.email;
            name = payloadData.name || email.split('@')[0];
            role = 'student'; // BATU tokens are strictly for students
            
        } else if (token) {
            // ── Firebase Authentication ──
            const decodedToken = await admin.auth().verifyIdToken(token);
            email = decodedToken.email;
            name = decodedToken.name || email.split('@')[0];
            role = decodedToken.role || 'student';
        }

        if (email === 'admin@borg.com' || email.includes('admin')) {
            role = 'admin';
        } else if (email.includes('doctor')) {
            role = 'doctor';
        }

        // Auto-sync user in our DB (Safe concurrent registration)
        const randomPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
        let [user, created] = await User.findOrCreate({
            where: { email },
            defaults: {
                name: name,
                role: role,
                is_admin: role === 'admin',
                password: randomPassword
            }
        });
        
        if (!created) {
            const shouldUpdateRole = (role === 'admin' || role === 'doctor' || (token && role !== 'student'));
            await user.update({ 
                name: name ? name : user.name, 
                role: shouldUpdateRole ? role : user.role, 
                is_admin: shouldUpdateRole ? (role === 'admin') : user.is_admin 
            });
        }

        // Log the user in securely
        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            is_admin: user.is_admin,
            balance: user.balance,
            avatar_url: user.avatar_url
        };

        if (redirect && redirect.startsWith('/')) {
            return res.redirect(redirect);
        }

        if (user.is_admin || user.role === 'doctor') {
            return res.redirect('/admin/dashboard');
        }
        return res.redirect('/home');
        
    } catch (error) {
        console.error('SSO Error:', error);
        res.status(401).send('Authentication Failed');
    }
};

exports.updateProfile = async (req, res) => {
    let avatar_url = req.body.avatar_url;
    if (req.file) {
        avatar_url = '/uploads/avatars/' + req.file.filename;
    }
    try {
        await User.update({ avatar_url }, { where: { id: req.session.user.id } });
        req.session.user.avatar_url = avatar_url;
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
    res.redirect('/login');
};
