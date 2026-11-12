const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, Recharge, Purchase, Item, sequelize } = require('../models');

/**
 * Validates external or local upload URLs so unsafe schemes like javascript: are rejected.
 */
function sanitizeResourceUrl(url, fallback = '') {
    const clean = (url || '').trim();
    if (!clean) return fallback;
    if (clean === '#' || /^(\/|https?:\/\/)/i.test(clean)) {
        return clean;
    }
    return fallback;
}

/**
 * Safely deletes local uploaded files without touching external URLs or crashing on missing paths.
 */
function tryDeleteLocalUpload(fileUrl) {
    if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;
    const relativeSubpath = fileUrl.replace(/^\/uploads\//, '');
    const candidates = [
        path.join(__dirname, '../public/uploads', relativeSubpath),
        path.join('/tmp/uploads', relativeSubpath)
    ];

    candidates.forEach(fullPath => {
        try {
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        } catch (err) {
            console.warn('Could not delete file:', fullPath, err.message);
        }
    });
}

exports.dashboard = async (req, res) => {
    try {
        const [usersCount, payments, sales, courses] = await Promise.all([
            User.count(),
            Recharge.sum('amount', { where: { status: 'success' } }),
            Purchase.sum('amount'),
            Item.findAll({ order: [['createdAt', 'DESC']] })
        ]);

        res.render('admin/dashboard', {
            stats: {
                usersCount: usersCount || 0,
                payments: payments || 0,
                sales: sales || 0,
                itemsCount: courses.length
            },
            courses
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        req.session.error = 'Failed to load management dashboard.';
        res.redirect('/store/ds');
    }
};

exports.userLookup = async (req, res) => {
    const query = (req.query.query || '').trim();
    if (!query) {
        return res.render('admin/user_lookup', {
            targetUser: null,
            searchResults: [],
            query: ''
        });
    }

    try {
        const idPart = query.includes('@') ? query.split('@')[0] : query;
        const exactCandidates = [...new Set([
            query,
            query.toLowerCase(),
            idPart,
            idPart.toLowerCase(),
            `${idPart}@batechu.com`,
            `${idPart.toLowerCase()}@batechu.com`,
            `${idPart}@btechu.com`,
            `${idPart.toLowerCase()}@btechu.com`
        ])];

        let targetUser = null;
        for (const candidate of exactCandidates) {
            targetUser = await User.findOne({ where: { email: candidate } });
            if (targetUser) break;
        }

        let searchResults = [];
        if (!targetUser) {
            const likeOp = sequelize.getDialect() === 'postgres' ? Op.iLike : Op.like;
            searchResults = await User.findAll({
                where: {
                    [Op.or]: [
                        { email: { [likeOp]: `%${query}%` } },
                        { name: { [likeOp]: `%${query}%` } }
                    ]
                },
                limit: 10,
                order: [['createdAt', 'DESC']]
            });

            if (searchResults.length === 1) {
                targetUser = searchResults[0];
                searchResults = [];
            }
        }

        if (targetUser) {
            const [purchases, recharges] = await Promise.all([
                Purchase.findAll({
                    where: { user_id: targetUser.id },
                    include: [Item],
                    order: [['createdAt', 'DESC']]
                }),
                Recharge.findAll({
                    where: { user_id: targetUser.id },
                    order: [['createdAt', 'DESC']]
                })
            ]);
            targetUser.purchases = purchases;
            targetUser.recharges = recharges;
        }

        res.render('admin/user_lookup', { targetUser, searchResults, query });
    } catch (error) {
        console.error('Admin user lookup error:', error);
        req.session.error = 'User lookup failed.';
        res.redirect('/admin/dashboard');
    }
};

exports.adjustPoints = async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const points = parseInt(req.body.points, 10);
    const action = req.body.action === 'set' ? 'set' : 'add';

    if (!Number.isInteger(userId) || !Number.isInteger(points)) {
        req.session.error = 'Please enter a valid integer point amount.';
        return res.redirect('/admin/users');
    }

    try {
        const target = await User.findByPk(userId);
        if (!target) {
            req.session.error = 'User not found.';
            return res.redirect('/admin/users');
        }

        const nextBalance = action === 'set' ? points : target.balance + points;
        if (nextBalance < 0) {
            req.session.error = 'User balance cannot become negative.';
            return res.redirect(`/admin/users?query=${encodeURIComponent(target.email)}`);
        }

        target.balance = nextBalance;
        await target.save();

        if (req.session.user && req.session.user.id === target.id) {
            req.session.user.balance = target.balance;
        }

        req.session.success = action === 'set'
            ? `Set ${target.name}'s balance to ${target.balance} Pt.`
            : `Adjusted ${target.name}'s balance by ${points >= 0 ? '+' : ''}${points} Pt (New: ${target.balance} Pt).`;

        res.redirect(`/admin/users?query=${encodeURIComponent(target.email)}`);
    } catch (error) {
        console.error('Adjust points error:', error);
        req.session.error = 'Failed to adjust points.';
        res.redirect('/admin/users');
    }
};

exports.resetPassword = async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const newPassword = (req.body.new_password || '').trim();

    if (!Number.isInteger(userId) || newPassword.length < 4) {
        req.session.error = 'Password must be at least 4 characters long.';
        return res.redirect('/admin/users');
    }

    try {
        const target = await User.findByPk(userId);
        if (!target) {
            req.session.error = 'User not found.';
            return res.redirect('/admin/users');
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        await target.update({ password: hashed });

        req.session.success = `Password reset successfully for ${target.name}.`;
        res.redirect(`/admin/users?query=${encodeURIComponent(target.email)}`);
    } catch (error) {
        console.error('Reset password error:', error);
        req.session.error = 'Failed to reset user password.';
        res.redirect('/admin/users');
    }
};

exports.toggleUserStatus = async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (!Number.isInteger(userId)) {
        req.session.error = 'Invalid user ID.';
        return res.redirect('/admin/users');
    }

    if (req.currentUser && req.currentUser.id === userId) {
        req.session.error = 'You cannot suspend your own active admin account.';
        return res.redirect(`/admin/users?query=${encodeURIComponent(req.currentUser.email)}`);
    }

    try {
        const target = await User.findByPk(userId);
        if (!target) {
            req.session.error = 'User not found.';
            return res.redirect('/admin/users');
        }

        target.is_active = !target.is_active;
        await target.save();

        req.session.success = `${target.name}'s account is now ${target.is_active ? 'Active' : 'Suspended'}.`;
        res.redirect(`/admin/users?query=${encodeURIComponent(target.email)}`);
    } catch (error) {
        console.error('Toggle user status error:', error);
        req.session.error = 'Failed to update account status.';
        res.redirect('/admin/users');
    }
};

exports.storeCourse = async (req, res) => {
    const name = (req.body.name || '').trim();
    const description = (req.body.description || '').trim();
    const category = (req.body.category || '').trim();
    const parsedPrice = parseInt(req.body.price, 10);

    if (!name || !category || Number.isNaN(parsedPrice) || parsedPrice < 0) {
        req.session.error = 'Please enter a valid title, category, and non-negative price.';
        return res.redirect('/admin/dashboard');
    }

    let image_url = sanitizeResourceUrl(req.body.image_url, '');
    let file_path = sanitizeResourceUrl(req.body.file_path, '#');

    if (req.files) {
        if (req.files.cover_image && req.files.cover_image[0]) {
            image_url = '/uploads/covers/' + req.files.cover_image[0].filename;
        }
        if (req.files.material_file && req.files.material_file[0]) {
            file_path = '/uploads/materials/' + req.files.material_file[0].filename;
        }
    }

    if (!image_url) {
        image_url = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80';
    }

    try {
        await Item.create({
            name,
            description,
            category,
            price: parsedPrice,
            image_url,
            file_path,
            instructor_id: req.currentUser.id
        });

        req.session.success = 'Course material published successfully.';
        res.redirect('/admin/dashboard');
    } catch (error) {
        console.error('Store course error:', error);
        req.session.error = 'Failed to publish course material.';
        res.redirect('/admin/dashboard');
    }
};

exports.deleteItem = async (req, res) => {
    const itemId = parseInt(req.params.id, 10);
    if (!Number.isInteger(itemId)) {
        req.session.error = 'Invalid item ID.';
        return res.redirect('/admin/dashboard');
    }

    const t = await sequelize.transaction();
    try {
        const item = await Item.findByPk(itemId, { transaction: t });
        if (!item) {
            await t.rollback();
            req.session.error = 'Item not found.';
            return res.redirect('/admin/dashboard');
        }

        // Preserve historical purchase logs while clearing FK references cleanly on Postgres
        await Purchase.update({ item_id: null }, { where: { item_id: item.id }, transaction: t });
        await item.destroy({ transaction: t });
        await t.commit();

        tryDeleteLocalUpload(item.image_url);
        tryDeleteLocalUpload(item.file_path);

        req.session.success = 'Item deleted successfully.';
        res.redirect('/admin/dashboard');
    } catch (error) {
        await t.rollback();
        console.error('Delete item error:', error);
        req.session.error = 'Failed to delete item.';
        res.redirect('/admin/dashboard');
    }
};
