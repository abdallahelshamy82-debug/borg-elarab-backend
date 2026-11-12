const { Recharge, User, sequelize } = require('../models');
const crypto = require('crypto');

const PAYMOB_HMAC_FIELDS = [
    'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction',
    'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded',
    'is_standalone_payment', 'is_voided', 'order', 'owner', 'pending',
    'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success'
];

function isPaymobConfigured() {
    return Boolean(
        process.env.PAYMOB_API_KEY &&
        process.env.PAYMOB_INTEGRATION_ID &&
        process.env.PAYMOB_IFRAME_ID &&
        process.env.PAYMOB_HMAC
    );
}

function safeTimingEqualHex(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length || a.length === 0 || a.length % 2 !== 0) return false;
    if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

async function paymobPost(url, payload) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`Paymob HTTP ${response.status}: ${JSON.stringify(data)}`);
    }
    return data;
}

/**
 * Extracts Paymob HMAC source fields uniformly from GET query params or POST webhook obj.
 */
function getHmacFieldValue(source, key, isNestedObj) {
    if (!isNestedObj) {
        return source[key] !== undefined && source[key] !== null ? String(source[key]) : '';
    }
    if (key === 'order') {
        const orderVal = source.order && typeof source.order === 'object' ? source.order.id : source.order;
        return orderVal !== undefined && orderVal !== null ? String(orderVal) : '';
    }
    if (key.startsWith('source_data.')) {
        const subKey = key.slice('source_data.'.length);
        const val = source.source_data ? source.source_data[subKey] : '';
        return val !== undefined && val !== null ? String(val) : '';
    }
    const val = source[key];
    return val !== undefined && val !== null ? String(val) : '';
}

function verifyHmac(source, incomingHmac, isNestedObj = false) {
    const hmacSecret = process.env.PAYMOB_HMAC;
    if (!hmacSecret || !source || !incomingHmac) return false;

    const concatenated = PAYMOB_HMAC_FIELDS
        .map(field => getHmacFieldValue(source, field, isNestedObj))
        .join('');

    const expectedHex = crypto.createHmac('sha512', hmacSecret).update(concatenated).digest('hex');
    return safeTimingEqualHex(expectedHex, String(incomingHmac));
}

/**
 * Atomically settles a verified Paymob callback so points are credited at most once.
 */
async function settleRechargeCallback({ isSuccess, merchantOrderId, paymobOrderId, amountCents }) {
    const parsedId = parseInt(String(merchantOrderId || '').split('_')[0], 10);
    const hasMerchantId = Number.isInteger(parsedId) && parsedId > 0;
    const hasPaymobOrderId = Boolean(paymobOrderId);

    if (!hasMerchantId && !hasPaymobOrderId) {
        return { ok: false, reason: 'Invalid merchant order reference.' };
    }

    const t = await sequelize.transaction();
    try {
        const whereClause = hasMerchantId
            ? { id: parsedId, status: 'pending' }
            : { paymob_order_id: String(paymobOrderId), status: 'pending' };

        const recharge = await Recharge.findOne({
            where: whereClause,
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!recharge) {
            await t.rollback();
            return { ok: false, reason: 'Transaction already processed or not found.' };
        }

        if (recharge.paymob_order_id && paymobOrderId && String(recharge.paymob_order_id) !== String(paymobOrderId)) {
            await t.rollback();
            return { ok: false, reason: 'Order ID mismatch.' };
        }

        const expectedCents = Math.round((recharge.amount / 2) * 100);
        if (amountCents !== undefined && Number(amountCents) !== expectedCents) {
            await t.rollback();
            return { ok: false, reason: 'Payment amount mismatch.' };
        }

        if (!isSuccess) {
            recharge.status = 'failed';
            await recharge.save({ transaction: t });
            await t.commit();
            return { ok: false, failed: true, userId: recharge.user_id, reason: 'Payment failed or was cancelled.' };
        }

        const user = await User.findByPk(recharge.user_id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!user) {
            await t.rollback();
            return { ok: false, reason: 'User account not found for this recharge.' };
        }

        recharge.status = 'success';
        await recharge.save({ transaction: t });

        user.balance += recharge.amount;
        await user.save({ transaction: t });

        await t.commit();
        return {
            ok: true,
            userId: user.id,
            amount: recharge.amount,
            newBalance: user.balance
        };
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

exports.showRecharge = (req, res) => {
    res.render('new', {
        paymobReady: isPaymobConfigured()
    });
};

exports.initiatePayment = async (req, res) => {
    if (!isPaymobConfigured()) {
        req.session.error = 'Paymob payment gateway is not configured on this server yet.';
        return res.redirect('/recharge');
    }

    const points = parseInt(req.body.amount, 10);
    if (!Number.isInteger(points) || points < 20 || points > 20000) {
        req.session.error = 'Please choose an amount between 20 and 20,000 Pt.';
        return res.redirect('/recharge');
    }

    let recharge = null;
    try {
        const costEgp = points / 2; // 2 Pt = 1 EGP
        const amountCents = Math.round(costEgp * 100);

        recharge = await Recharge.create({
            user_id: req.currentUser.id,
            amount: points,
            method: 'paymob',
            status: 'pending'
        });

        const apiKey = process.env.PAYMOB_API_KEY;
        const integrationId = process.env.PAYMOB_INTEGRATION_ID;
        const iframeId = process.env.PAYMOB_IFRAME_ID;

        // 1. Authentication
        const authData = await paymobPost('https://accept.paymob.com/api/auth/tokens', { api_key: apiKey });
        if (!authData.token) {
            throw new Error('Missing Paymob auth token');
        }

        // 2. Order Registration
        const orderData = await paymobPost('https://accept.paymob.com/api/ecommerce/orders', {
            auth_token: authData.token,
            delivery_needed: 'false',
            amount_cents: amountCents,
            currency: 'EGP',
            merchant_order_id: `${recharge.id}_${Date.now()}`,
            items: []
        });

        if (!orderData.id) {
            throw new Error('Missing Paymob order ID');
        }
        await recharge.update({ paymob_order_id: String(orderData.id) });

        // 3. Payment Key Generation
        const nameParts = (req.currentUser.name || 'University Student').trim().split(/\s+/);
        const firstName = nameParts[0] || 'Student';
        const lastName = nameParts.slice(1).join(' ') || 'User';

        const paymentKeyData = await paymobPost('https://accept.paymob.com/api/acceptance/payment_keys', {
            auth_token: authData.token,
            amount_cents: amountCents,
            expiration: 3600,
            order_id: orderData.id,
            billing_data: {
                apartment: 'NA',
                email: req.currentUser.email.includes('@') ? req.currentUser.email : `${req.currentUser.email}@batechu.com`,
                floor: 'NA',
                first_name: firstName,
                street: 'NA',
                building: 'NA',
                phone_number: '01000000000',
                shipping_method: 'NA',
                postal_code: 'NA',
                city: 'Borg El Arab',
                country: 'EG',
                last_name: lastName,
                state: 'Alexandria'
            },
            currency: 'EGP',
            integration_id: integrationId
        });

        if (!paymentKeyData.token) {
            throw new Error('Missing Paymob payment key token');
        }

        res.redirect(`https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKeyData.token}`);
    } catch (error) {
        console.error('Paymob initiate error:', error);
        if (recharge) {
            await recharge.update({ status: 'failed' }).catch(() => {});
        }
        req.session.error = 'Failed to connect to Paymob payment gateway. Please try again.';
        res.redirect('/recharge');
    }
};

exports.callback = async (req, res) => {
    try {
        if (!verifyHmac(req.query, req.query.hmac, false)) {
            if (req.session && req.session.user) {
                req.session.error = 'Security Error: Invalid payment signature.';
                return res.redirect('/recharge');
            }
            return res.status(403).render('payment_result', {
                ok: false,
                title: 'Verification Failed',
                message: 'Invalid payment signature. No points were added.'
            });
        }

        const result = await settleRechargeCallback({
            isSuccess: req.query.success === 'true',
            merchantOrderId: req.query.merchant_order_id,
            paymobOrderId: req.query.order,
            amountCents: req.query.amount_cents
        });

        const hasMatchingSession = req.session && req.session.user && result.userId && req.session.user.id === result.userId;

        if (result.ok) {
            if (hasMatchingSession) {
                req.session.user.balance = result.newBalance;
                req.session.success = `Paymob transaction successful! +${result.amount} Pt added to your wallet.`;
                return res.redirect('/store/ds');
            }
            return res.render('payment_result', {
                ok: true,
                title: 'Payment Successful',
                message: `${result.amount} Pt has been credited to your account.`,
                amount: result.amount
            });
        }

        if (hasMatchingSession) {
            req.session.error = result.reason;
            return res.redirect('/store/ds');
        }
        return res.status(result.failed ? 200 : 400).render('payment_result', {
            ok: false,
            title: result.failed ? 'Payment Cancelled or Failed' : 'Payment Notice',
            message: result.reason
        });
    } catch (error) {
        console.error('Paymob GET callback error:', error);
        if (req.session && req.session.user) {
            req.session.error = 'Payment verification failed.';
            return res.redirect('/recharge');
        }
        res.status(500).render('payment_result', {
            ok: false,
            title: 'Payment Verification Error',
            message: 'An error occurred while verifying your payment.'
        });
    }
};

exports.webhookCallback = async (req, res) => {
    try {
        const obj = req.body && req.body.obj ? req.body.obj : null;
        const hmac = req.query.hmac || (req.body && req.body.hmac);

        if (!obj || !verifyHmac(obj, hmac, true)) {
            return res.status(403).json({ received: false, error: 'Invalid HMAC signature' });
        }

        const orderObj = obj.order && typeof obj.order === 'object' ? obj.order : {};
        await settleRechargeCallback({
            isSuccess: obj.success === true || obj.success === 'true',
            merchantOrderId: orderObj.merchant_order_id || obj.merchant_order_id,
            paymobOrderId: orderObj.id || obj.order,
            amountCents: obj.amount_cents
        });

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Paymob POST webhook error:', error);
        res.status(500).json({ received: false });
    }
};
