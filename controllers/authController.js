const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { User } = require('../models');

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
    const { user_id, name, role, timestamp, signature } = req.query;

    if (!user_id || !name || !role || !timestamp || !signature) {
        return res.status(400).send('Missing SSO parameters');
    }

    // 1. Verify Timestamp (prevent replay attacks - links expire after 5 minutes)
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime - parseInt(timestamp) > 300) {
        return res.status(403).send('SSO Link Expired');
    }

    // 2. Verify Signature
    const secret = process.env.SSO_SECRET || 'BorgElArabSecret2026';
    const payload = `${user_id}|${name}|${role}|${timestamp}`;
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    if (expectedSignature !== signature) {
        return res.status(403).send('Invalid SSO Signature');
    }

    try {
        // 3. Auto-sync user in our DB
        let user = await User.findOne({ where: { email: user_id } });
        
        if (!user) {
            const randomPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
            user = await User.create({
                email: user_id,
                name: name,
                role: role,
                is_admin: role === 'admin',
                password: randomPassword
            });
        } else {
            // Update name and role just in case they changed in the main system
            await user.update({ name, role, is_admin: role === 'admin' });
        }

        // 4. Log the user in
        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            is_admin: user.is_admin,
            balance: user.balance
        };

        // 5. Redirect to specific page if requested
        const { redirect } = req.query;
        if (redirect) {
            // Basic security check to prevent open redirects (only allow relative paths)
            if (redirect.startsWith('/')) {
                return res.redirect(redirect);
            }
        }

        // 6. Default Redirect based on role
        if (user.is_admin || user.role === 'doctor') {
            return res.redirect('/admin/dashboard');
        }
        return res.redirect('/home');
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error during SSO');
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
