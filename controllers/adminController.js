const { User, Recharge, Purchase, Item } = require('../models');

exports.dashboard = async (req, res) => {
    try {
        const usersCount = await User.count();
        const payments = await Recharge.sum('amount', { where: { status: 'success' } }) || 0;
        
        // Let's get total sales from purchases
        const sales = await Purchase.sum('amount') || 0;

        res.render('admin/dashboard', {
            stats: { usersCount, payments, sales }
        });
    } catch (error) {
        console.error(error);
        req.session.error = 'Failed to load dashboard.';
        res.redirect('back');
    }
};

exports.userLookup = async (req, res) => {
    try {
        const { query } = req.query;
        let users = [];
        
        if (query) {
            users = await User.findAll({
                where: {
                    email: query
                }
            });
        } else {
            users = await User.findAll({ limit: 50 });
        }

        res.render('admin/user_lookup', { users, query });
    } catch (error) {
        console.error(error);
        req.session.error = 'User lookup failed.';
        res.redirect('back');
    }
};

exports.adjustPoints = async (req, res) => {
    const { id } = req.params;
    const { adjustment, reason } = req.body;
    
    try {
        const user = await User.findByPk(id);
        if (!user) {
            req.session.error = 'User not found.';
            return res.redirect('back');
        }

        user.balance += parseInt(adjustment);
        await user.save();

        req.session.success = `Adjusted ${user.name}'s balance by ${adjustment} points.`;
        res.redirect('back');
    } catch (error) {
        console.error(error);
        req.session.error = 'Failed to adjust points.';
        res.redirect('back');
    }
};
