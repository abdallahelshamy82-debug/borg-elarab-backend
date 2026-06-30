const { Item, Purchase, User } = require('../models');

exports.showStore = async (req, res) => {
    try {
        const items = await Item.findAll();
        res.render('PS', { items });
    } catch (error) {
        console.error(error);
        req.session.error = 'Failed to load store.';
        res.redirect('back');
    }
};

exports.showDashboard = async (req, res) => {
    try {
        const items = await Item.findAll();
        const purchases = await Purchase.findAll({ 
            where: { user_id: req.session.user.id },
            include: [Item]
        });
        const user = await User.findByPk(req.session.user.id);
        const recharges = await user.getRecharges();

        res.render('DS', { items, purchases, recharges });
    } catch (error) {
        console.error(error);
        req.session.error = 'Failed to load dashboard.';
        res.redirect('back');
    }
};

exports.purchaseItem = async (req, res) => {
    const { id } = req.params;
    try {
        const item = await Item.findByPk(id);
        const user = await User.findByPk(req.session.user.id);

        if (!item) {
            req.session.error = 'Item not found.';
            return res.redirect('back');
        }

        if (user.balance < item.price) {
            req.session.error = 'Insufficient balance.';
            return res.redirect('back');
        }

        // Proceed with purchase
        user.balance -= item.price;
        await user.save();
        
        // Update session balance
        req.session.user.balance = user.balance;

        await Purchase.create({
            user_id: user.id,
            item_id: item.id,
            amount: item.price
        });

        req.session.success = 'Purchase successful!';
        res.redirect('/store/ds');
    } catch (error) {
        console.error(error);
        req.session.error = 'Purchase failed.';
        res.redirect('back');
    }
};
