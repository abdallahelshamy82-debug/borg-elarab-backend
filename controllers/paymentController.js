const { Recharge, User, sequelize } = require('../models');
const crypto = require('crypto');

exports.showRecharge = (req, res) => {
    res.render('new'); // The recharge view
};

exports.initiatePayment = async (req, res) => {
    const { amount } = req.body;
    
    try {
        const points = parseInt(amount, 10);
        if (isNaN(points) || points < 20) {
            req.session.error = 'Invalid amount.';
            return res.redirect('back');
        }

        const costEgp = points / 2; // Assuming 2 Pt = 1 EGP

        const recharge = await Recharge.create({
            user_id: req.session.user.id,
            amount: points,
            method: 'paymob',
            status: 'pending'
        });

        const apiKey = process.env.PAYMOB_API_KEY;
        const integrationId = process.env.PAYMOB_INTEGRATION_ID;
        const iframeId = process.env.PAYMOB_IFRAME_ID;

        // 1. Authentication
        const authResponse = await fetch('https://accept.paymob.com/api/auth/tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey })
        });
        const authData = await authResponse.json();
        const token = authData.token;

        if (!token) {
            console.error('Paymob Auth Failed', authData);
            req.session.error = 'Payment gateway authentication failed.';
            return res.redirect('back');
        }

        // 2. Order Registration
        const orderResponse = await fetch('https://accept.paymob.com/api/ecommerce/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                auth_token: token,
                delivery_needed: 'false',
                amount_cents: costEgp * 100,
                currency: 'EGP',
                merchant_order_id: recharge.id + '_' + Date.now(),
                items: []
            })
        });
        const orderData = await orderResponse.json();
        const orderId = orderData.id;

        // 3. Payment Key Generation
        const user = req.session.user;
        const paymentKeyResponse = await fetch('https://accept.paymob.com/api/acceptance/payment_keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                auth_token: token,
                amount_cents: costEgp * 100,
                expiration: 3600,
                order_id: orderId,
                billing_data: {
                    apartment: 'NA', 
                    email: user.email || 'guest@example.com', 
                    floor: 'NA', 
                    first_name: user.name || 'User',
                    street: 'NA', 
                    building: 'NA', 
                    phone_number: '01000000000', 
                    shipping_method: 'NA', 
                    postal_code: 'NA', 
                    city: 'NA', 
                    country: 'NA', 
                    last_name: user.name || 'Name',
                    state: 'NA'
                },
                currency: 'EGP',
                integration_id: integrationId
            })
        });
        const paymentKeyData = await paymentKeyResponse.json();
        const paymentToken = paymentKeyData.token;

        if (!paymentToken) {
            console.error('Paymob Key Gen Failed', paymentKeyData);
            req.session.error = 'Payment initialization failed.';
            return res.redirect('back');
        }

        // Redirect to iframe
        res.redirect(`https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentToken}`);

    } catch (error) {
        console.error(error);
        req.session.error = 'Failed to initiate payment.';
        res.redirect('back');
    }
};

function verifyHmac(query) {
    const concatenatedString = 
        (query.amount_cents || '') +
        (query.created_at || '') +
        (query.currency || '') +
        (query.error_occured || '') +
        (query.has_parent_transaction || '') +
        (query.id || '') +
        (query.integration_id || '') +
        (query.is_3d_secure || '') +
        (query.is_auth || '') +
        (query.is_capture || '') +
        (query.is_refunded || '') +
        (query.is_standalone_payment || '') +
        (query.is_voided || '') +
        (query.order || '') +
        (query.owner || '') +
        (query.pending || '') +
        (query['source_data.pan'] || '') +
        (query['source_data.sub_type'] || '') +
        (query['source_data.type'] || '') +
        (query.success || '');

    const hmacSecret = process.env.PAYMOB_HMAC;
    if (!hmacSecret) return false;
    
    const hashed = crypto.createHmac('sha512', hmacSecret).update(concatenatedString).digest('hex');

    // Secure compare
    return hashed === (query.hmac || '');
}

exports.callback = async (req, res) => {
    try {
        if (!verifyHmac(req.query)) {
            req.session.error = 'Security Error: Invalid payment signature.';
            return res.redirect('/recharge');
        }

        const success = req.query.success;
        const merchantOrderId = req.query.merchant_order_id;

        if (success === 'true' && merchantOrderId) {
            // Extract recharge ID from merchant_order_id (format: id_timestamp)
            const rechargeId = merchantOrderId.split('_')[0];

            const t = await sequelize.transaction();
            try {
                const recharge = await Recharge.findOne({
                    where: {
                        id: rechargeId,
                        status: 'pending'
                    },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });
                
                if (recharge) {
                    recharge.status = 'success';
                    await recharge.save({ transaction: t });

                    const user = await User.findByPk(recharge.user_id, { transaction: t, lock: t.LOCK.UPDATE });
                    if (user) {
                        user.balance += recharge.amount;
                        await user.save({ transaction: t });
                        
                        await t.commit(); // Securely commit changes
                        
                        // Update session
                        if (req.session && req.session.user) {
                            req.session.user.balance = user.balance;
                        }
                        
                        req.session.success = `Paymob transaction successful! ${recharge.amount} Pt added.`;
                        return res.redirect('/store/ds');
                    } else {
                        await t.rollback();
                        req.session.error = "User not found for recharge.";
                        return res.redirect('/store/ds');
                    }
                } else {
                    await t.rollback();
                    req.session.error = 'Transaction already processed or not found.';
                    return res.redirect('/store/ds');
                }
            } catch (err) {
                await t.rollback();
                throw err; // handled by outer catch
            }
        } else {
            req.session.error = 'Payment failed or was cancelled.';
            return res.redirect('/store/ds');
        }
    } catch (error) {
        console.error(error);
        req.session.error = 'Payment verification failed.';
        res.redirect('/recharge');
    }
};
