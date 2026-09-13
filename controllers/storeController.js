const { Item, Purchase, User, Recharge, sequelize } = require('../models');

exports.showStore = async (req, res) => {
    try {
        const items = await Item.findAll();
        let purchasedItemIds = [];
        if (req.session && req.session.user) {
            const purchases = await Purchase.findAll({ where: { user_id: req.session.user.id } });
            purchasedItemIds = purchases.map(p => p.item_id);
        }
        res.render('PS', { items, purchasedItemIds });
    } catch (error) {
        console.error(error);
        req.session.error = 'Failed to load store.';
        res.redirect('/login');
    }
};

exports.showDashboard = async (req, res) => {
    try {
        const user = await User.findByPk(req.session.user.id);
        if (!user) {
            req.session = null;
            return res.redirect('/login');
        }

        // Keep session updated
        req.session.user.balance = user.balance;
        req.session.user.name = user.name;
        req.session.user.avatar_url = user.avatar_url;

        const items = await Item.findAll();
        const purchases = await Purchase.findAll({ 
            where: { user_id: user.id },
            include: [Item]
        });
        const recharges = await Recharge.findAll({
            where: { user_id: user.id }
        });

        const transactions = [];
        
        purchases.forEach(p => {
            transactions.push({
                type: 'purchase',
                date: p.createdAt,
                description: `Purchased: ${p.Item ? p.Item.name : 'Unknown'}`,
                amount: p.Item ? p.Item.price : 0,
                status: 'Completed'
            });
        });
        
        recharges.forEach(r => {
            transactions.push({
                type: 'recharge',
                date: r.createdAt,
                description: 'Recharge points',
                amount: r.amount,
                status: r.status ? (r.status.charAt(0).toUpperCase() + r.status.slice(1)) : 'Completed'
            });
        });

        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.render('DS', { user, items, purchases, recharges, transactions });
    } catch (error) {
        console.error(error);
        req.session.error = 'Failed to load dashboard.';
        res.redirect('/store/ps');
    }
};

exports.purchaseItem = async (req, res) => {
    const { id } = req.params;
    const t = await sequelize.transaction();

    try {
        const item = await Item.findByPk(id);
        if (!item) {
            await t.rollback();
            req.session.error = 'Item not found.';
            return res.redirect('back');
        }

        const user = await User.findByPk(req.session.user.id, { transaction: t, lock: t.LOCK.UPDATE });
        
        if (!user) {
            await t.rollback();
            return res.redirect('/');
        }

        if (user.balance < item.price) {
            await t.rollback();
            req.session.error = 'Insufficient balance.';
            return res.redirect('back');
        }

        const existingPurchase = await Purchase.findOne({
            where: { user_id: req.session.user.id, item_id: id },
            transaction: t
        });

        if (existingPurchase) {
            await t.rollback();
            req.session.error = 'You already own this item.';
            return res.redirect('back');
        }

        // Proceed with purchase
        user.balance -= item.price;
        await user.save({ transaction: t });
        
        await Purchase.create({
            user_id: user.id,
            item_id: item.id,
            amount: item.price
        }, { transaction: t });

        await t.commit();
        
        // Update session balance
        req.session.user.balance = user.balance;

        req.session.success = 'Purchase successful!';
        res.redirect('/store/ds');
    } catch (error) {
        await t.rollback();
        console.error(error);
        req.session.error = 'Purchase failed.';
        res.redirect('back');
    }
};
