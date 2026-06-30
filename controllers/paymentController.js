const { Recharge, User } = require('../models');

exports.showRecharge = (req, res) => {
    res.render('new'); // The recharge view
};

exports.initiatePayment = async (req, res) => {
    const { amount } = req.body;
    
    try {
        const recharge = await Recharge.create({
            user_id: req.session.user.id,
            amount: amount,
            method: 'paymob',
            status: 'pending'
        });

        // 1. Authenticate with Paymob to get token
        // 2. Register Order
        // 3. Get Payment Key
        // (Mocking this flow for now to match the PHP version)
        
        req.session.payment = {
            amount: amount,
            recharge_id: recharge.id
        };

        res.render('paymob_mock', { amount, recharge_id: recharge.id });

    } catch (error) {
        console.error(error);
        req.session.error = 'Failed to initiate payment.';
        res.redirect('back');
    }
};

exports.mockPaymobCallback = async (req, res) => {
    const { success, recharge_id } = req.query;

    try {
        const recharge = await Recharge.findByPk(recharge_id);
        
        if (!recharge) {
            req.session.error = 'Payment record not found.';
            return res.redirect('/store/ds');
        }

        if (success === 'true') {
            recharge.status = 'success';
            await recharge.save();

            const user = await User.findByPk(recharge.user_id);
            user.balance += recharge.amount;
            await user.save();
            
            // Update session
            req.session.user.balance = user.balance;

            req.session.success = `Payment of ${recharge.amount} Pt successful!`;
        } else {
            recharge.status = 'failed';
            await recharge.save();
            req.session.error = 'Payment failed.';
        }

        res.redirect('/store/ds');
    } catch (error) {
        console.error(error);
        req.session.error = 'Payment verification failed.';
        res.redirect('/store/ds');
    }
};
