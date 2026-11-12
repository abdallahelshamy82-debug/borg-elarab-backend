const { Item, Purchase, User, Recharge, sequelize } = require('../models');

exports.showStore = async (req, res) => {
    try {
        const items = await Item.findAll({ order: [['createdAt', 'DESC']] });
        const purchases = await Purchase.findAll({ where: { user_id: req.currentUser.id } });
        const purchasedItemIds = purchases.map(p => p.item_id).filter(Boolean);

        res.render('PS', { items, purchasedItemIds });
    } catch (error) {
        console.error('Show store error:', error);
        req.session.error = 'Failed to load store.';
        res.redirect('/store/ds');
    }
};

exports.showDashboard = async (req, res) => {
    try {
        const user = req.currentUser;

        const items = await Item.findAll();
        const purchases = await Purchase.findAll({
            where: { user_id: user.id },
            include: [Item],
            order: [['createdAt', 'DESC']]
        });
        const recharges = await Recharge.findAll({
            where: { user_id: user.id },
            order: [['createdAt', 'DESC']]
        });

        const transactions = [];

        purchases.forEach(p => {
            transactions.push({
                type: 'purchase',
                date: p.createdAt,
                description: `Purchased: ${p.Item ? p.Item.name : 'Archived Material'}`,
                amount: p.amount || (p.Item ? p.Item.price : 0),
                status: 'completed',
                statusLabel: 'Completed',
                isCredit: false
            });
        });

        recharges.forEach(r => {
            const rawStatus = (r.status || 'completed').toLowerCase();
            const statusLabel = rawStatus === 'success'
                ? 'Completed'
                : rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
            transactions.push({
                type: 'recharge',
                date: r.createdAt,
                description: `Wallet Recharge (${(r.method || 'paymob').toUpperCase()})`,
                amount: r.amount,
                status: rawStatus,
                statusLabel,
                isCredit: rawStatus === 'success'
            });
        });

        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        const totalRecharged = recharges
            .filter(r => r.status === 'success')
            .reduce((sum, r) => sum + (r.amount || 0), 0);

        res.render('DS', {
            user,
            items,
            purchases,
            recharges,
            transactions,
            totalRecharged
        });
    } catch (error) {
        console.error('Show dashboard error:', error);
        req.session.error = 'Failed to load dashboard.';
        res.redirect('/store/ps');
    }
};

exports.purchaseItem = async (req, res) => {
    const itemId = parseInt(req.params.id, 10);
    if (!Number.isInteger(itemId) || itemId <= 0) {
        req.session.error = 'Invalid item selected.';
        return res.redirect('/store/ps');
    }

    const t = await sequelize.transaction();

    try {
        const item = await Item.findByPk(itemId, { transaction: t });
        if (!item) {
            await t.rollback();
            req.session.error = 'Item not found.';
            return res.redirect('/store/ps');
        }

        const user = await User.findByPk(req.currentUser.id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!user) {
            await t.rollback();
            req.session = null;
            return res.redirect('/login');
        }

        const existingPurchase = await Purchase.findOne({
            where: { user_id: user.id, item_id: item.id },
            transaction: t
        });

        if (existingPurchase) {
            await t.rollback();
            req.session.error = 'You already own this item.';
            return res.redirect('/store/ds');
        }

        const price = Math.max(0, parseInt(item.price, 10) || 0);
        if (user.balance < price) {
            await t.rollback();
            req.session.error = `Insufficient balance. You need ${price - user.balance} more Pt.`;
            return res.redirect('/store/ps');
        }

        user.balance -= price;
        await user.save({ transaction: t });

        await Purchase.create({
            user_id: user.id,
            item_id: item.id,
            amount: price
        }, { transaction: t });

        await t.commit();

        req.session.user.balance = user.balance;
        req.session.success = `Unlocked "${item.name}" successfully!`;
        res.redirect('/store/ds');
    } catch (error) {
        await t.rollback();
        console.error('Purchase item error:', error);
        req.session.error = 'Purchase failed. Please try again.';
        res.redirect('/store/ps');
    }
};
