const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { User } = require('../models');

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'dwd-it2-92aa4'
    });
}

const DEFAULT_ADMIN_EMAILS = ['admin@system.com', 'admin@borg.com', 'admin@batechu.com'];
const DEFAULT_DOCTOR_EMAILS = ['doctor@system.com', 'doctor@batechu.com'];

function getAllowlist(envKey, defaults) {
    const raw = process.env[envKey];
    const items = raw ? raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : defaults;
    return new Set(items);
}

/**
 * Constant-time hex signature comparison to prevent timing side-channels.
 */
function safeTimingEqualHex(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length || a.length === 0 || a.length % 2 !== 0) return false;
    if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/**
 * Allows only safe internal relative redirect paths (blocks //evil.com and protocol URLs).
 */
function isSafeRelativeRedirect(redirectPath) {
    return typeof redirectPath === 'string' &&
        redirectPath.startsWith('/') &&
        !redirectPath.startsWith('//') &&
        !redirectPath.startsWith('/\\');
}

/**
 * Resolves SSO role strictly via verified claims or exact allowlists (never substring matching).
 */
function resolveSsoRole(email, verifiedClaimRole) {
    const emailLower = (email || '').trim().toLowerCase();
    const adminEmails = getAllowlist('ADMIN_EMAILS', DEFAULT_ADMIN_EMAILS);
    const doctorEmails = getAllowlist('DOCTOR_EMAILS', DEFAULT_DOCTOR_EMAILS);

    if (adminEmails.has(emailLower) || verifiedClaimRole === 'admin') {
        return 'admin';
    }
    if (doctorEmails.has(emailLower) || verifiedClaimRole === 'doctor') {
        return 'doctor';
    }
    return 'student';
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
    const rawEmail = (req.body.email || '').trim();
    const password = (req.body.password || '').trim();

    if (!rawEmail || !password) {
        req.session.error = 'Please enter both Student ID/Email and password.';
        return res.redirect('/login');
    }

    try {
        const lowerEmail = rawEmail.toLowerCase();
        const idPart = rawEmail.includes('@') ? rawEmail.split('@')[0] : rawEmail;
        const candidates = [...new Set([
            rawEmail,
            lowerEmail,
            idPart,
            idPart.toLowerCase(),
            `${idPart}@batechu.com`,
            `${idPart.toLowerCase()}@batechu.com`,
            `${idPart}@btechu.com`,
            `${idPart.toLowerCase()}@btechu.com`
        ])];

        let user = null;
        for (const candidate of candidates) {
            user = await User.findOne({ where: { email: candidate } });
            if (user) break;
        }

        if (user && await bcrypt.compare(password, user.password)) {
            if (!user.is_active) {
                req.session.error = 'Your account has been suspended. Please contact the administrator.';
                return res.redirect('/login');
            }

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
        console.error('Login error:', error);
        req.session.error = 'An error occurred during login.';
        res.redirect('/login');
    }
};

exports.ssoLogin = async (req, res) => {
    const { token, batu_token, redirect } = req.query;

    if (!token && !batu_token) {
        return res.status(400).render('error', {
            statusCode: 400,
            title: 'Missing Authentication Token',
            message: 'No authentication token was provided in the SSO request.'
        });
    }

    try {
        let email, name, role;

        if (batu_token) {
            const secret = process.env.BATU_SSO_SECRET || process.env.SSO_SECRET || 'BorgElArabSecret2026';
            const parts = String(batu_token).split('.');
            if (parts.length !== 2) {
                return res.status(401).render('error', {
                    statusCode: 401,
                    title: 'Invalid SSO Token',
                    message: 'Invalid BATU token format.'
                });
            }

            const [payloadBase64, signature] = parts;
            const expectedSignature = crypto.createHmac('sha256', secret).update(payloadBase64).digest('hex');

            if (!safeTimingEqualHex(signature, expectedSignature)) {
                return res.status(401).render('error', {
                    statusCode: 401,
                    title: 'Invalid Signature',
                    message: 'BATU token signature verification failed.'
                });
            }

            const payloadData = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'));
            if (!payloadData || !payloadData.email || Date.now() > Number(payloadData.exp)) {
                return res.status(401).render('error', {
                    statusCode: 401,
                    title: 'SSO Token Expired',
                    message: 'Your single sign-on link has expired. Please return to the university portal and try again.'
                });
            }

            email = String(payloadData.email).trim();
            name = (payloadData.name || email.split('@')[0]).trim();
            role = 'student';
        } else {
            const decodedToken = await admin.auth().verifyIdToken(String(token));
            if (!decodedToken.email) {
                return res.status(400).render('error', {
                    statusCode: 400,
                    title: 'Email Missing',
                    message: 'The Firebase account does not have an email address attached.'
                });
            }
            email = decodedToken.email.trim();
            name = (decodedToken.name || email.split('@')[0]).trim();
            role = resolveSsoRole(email, decodedToken.role);
        }

        let user = await User.findOne({ where: { email } });
        if (!user) {
            user = await User.findOne({ where: { email: email.toLowerCase() } });
        }

        if (!user) {
            const randomPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
            user = await User.create({
                email,
                name,
                role,
                is_admin: role === 'admin',
                password: randomPassword
            });
        } else {
            if (!user.is_active) {
                return res.status(403).render('error', {
                    statusCode: 403,
                    title: 'Account Suspended',
                    message: 'Your account has been suspended. Please contact the university administrator.'
                });
            }

            const nextRole = (user.is_admin || user.role === 'admin')
                ? 'admin'
                : (user.role === 'doctor' || role === 'doctor')
                    ? 'doctor'
                    : role;

            await user.update({
                name: name || user.name,
                role: nextRole,
                is_admin: nextRole === 'admin'
            });
        }

        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            is_admin: user.is_admin,
            balance: user.balance,
            avatar_url: user.avatar_url
        };

        if (isSafeRelativeRedirect(redirect)) {
            return res.redirect(redirect);
        }

        if (user.is_admin || user.role === 'doctor') {
            return res.redirect('/admin/dashboard');
        }
        return res.redirect('/store/ds');
    } catch (error) {
        console.error('SSO Error:', error);
        res.status(401).render('error', {
            statusCode: 401,
            title: 'SSO Authentication Failed',
            message: 'Unable to verify your authentication token. Please sign in again from the main portal.'
        });
    }
};

exports.updateProfile = async (req, res) => {
    const cleanName = (req.body.name || '').trim();
    const removeAvatar = req.body.remove_avatar === '1';
    const rawAvatarUrl = (req.body.avatar_url || '').trim();

    if (cleanName && cleanName.length < 2) {
        req.session.error = 'Display name must be at least 2 characters.';
        return res.redirect('/store/ds');
    }

    try {
        const user = await User.findByPk(req.session.user.id);
        if (!user) {
            req.session = null;
            return res.redirect('/login');
        }

        const updates = {};
        if (cleanName) {
            updates.name = cleanName;
        }

        if (req.file) {
            updates.avatar_url = '/uploads/avatars/' + req.file.filename;
        } else if (removeAvatar) {
            updates.avatar_url = null;
        } else if (rawAvatarUrl && /^(\/uploads\/|https?:\/\/)/i.test(rawAvatarUrl)) {
            updates.avatar_url = rawAvatarUrl;
        }

        if (Object.keys(updates).length > 0) {
            await user.update(updates);
            req.session.user.name = user.name;
            req.session.user.avatar_url = user.avatar_url;
        }

        req.session.success = 'Profile updated successfully.';
        res.redirect('/store/ds');
    } catch (error) {
        console.error('Update profile error:', error);
        req.session.error = 'Failed to update profile.';
        res.redirect('/store/ds');
    }
};

exports.updatePassword = async (req, res) => {
    const { current_password, new_password, new_password_confirmation } = req.body;

    if (!current_password || !new_password || !new_password_confirmation) {
        req.session.error = 'All password fields are required.';
        return res.redirect('/store/ds');
    }

    if (new_password !== new_password_confirmation) {
        req.session.error = 'New passwords do not match.';
        return res.redirect('/store/ds');
    }

    if (new_password.length < 4) {
        req.session.error = 'Password must be at least 4 characters long.';
        return res.redirect('/store/ds');
    }

    try {
        const user = await User.findByPk(req.session.user.id);
        if (!user) {
            req.session = null;
            return res.redirect('/login');
        }

        if (!await bcrypt.compare(current_password, user.password)) {
            req.session.error = 'Current password does not match.';
            return res.redirect('/store/ds');
        }

        const hashed = await bcrypt.hash(new_password, 10);
        await user.update({ password: hashed });

        req.session.success = 'Password updated successfully.';
        res.redirect('/store/ds');
    } catch (error) {
        console.error('Update password error:', error);
        req.session.error = 'Failed to update password.';
        res.redirect('/store/ds');
    }
};

exports.logout = (req, res) => {
    req.session = null;
    res.redirect('/login');
};
