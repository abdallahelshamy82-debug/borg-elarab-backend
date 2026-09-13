const { User, Recharge, Purchase, Item } = require('../models');

exports.dashboard = async (req, res) => {
    try {
        const usersCount = await User.count();
        const payments = await Recharge.sum('amount', { where: { status: 'success' } }) || 0;
        
        // Let's get total sales from purchases
        const sales = await Purchase.sum('amount') || 0;
        
        const courses = await Item.findAll();

        res.render('admin/dashboard', {
            stats: { usersCount, payments, sales },
            courses
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
        if (query) {
            let searchEmail = query;
            if (!searchEmail.includes('@')) {
                searchEmail = searchEmail + '@btechu.com';
            }
            
            const user = await User.findOne({
                where: { email: searchEmail }
            });
            
            if (user) {
                // Fetch associations manually if not configured in Sequelize
                user.purchases = await Purchase.findAll({ where: { user_id: user.id }, include: [Item] });
                user.recharges = await Recharge.findAll({ where: { user_id: user.id } });
            }
            
            res.render('admin/user_lookup', { user, query });
        } else {
            res.render('admin/user_lookup', { user: null, query: '' });
        }
    } catch (error) {
        console.error(error);
        req.session.error = 'User lookup failed.';
        res.redirect('back');
    }
};

exports.adjustPoints = async (req, res) => {
    const { id } = req.params;
    const { points } = req.body;
    
    try {
        const user = await User.findByPk(id);
        if (!user) {
            req.session.error = 'User not found.';
            return res.redirect('back');
        }

        user.balance += parseInt(points);
        await user.save();

        req.session.success = `Adjusted ${user.name}'s balance by ${points} points.`;
        res.redirect('back');
    } catch (error) {
        console.error(error);
        req.session.error = 'Failed to adjust points.';
        res.redirect('back');
    }
};

exports.storeCourse = async (req, res) => {
    let { name, description, category, price, image_url, file_path } = req.body;
    
    if (req.files) {
        if (req.files.cover_image && req.files.cover_image[0]) {
            image_url = '/uploads/covers/' + req.files.cover_image[0].filename;
        }
        if (req.files.material_file && req.files.material_file[0]) {
            file_path = '/uploads/materials/' + req.files.material_file[0].filename;
        }
    }

    try {
        await Item.create({
            name,
            description,
            category,
            price: parseInt(price) || 0,
            image_url,
            file_path,
            instructor_id: req.session.user.id
        });
        
        req.session.success = 'Course material uploaded successfully.';
        res.redirect('back');
    } catch (error) {
        console.error(error);
        req.session.error = 'Failed to upload course material.';
        res.redirect('back');
    }
};

exports.deleteItem = async (req, res) => {
    const { id } = req.params;
    try {
        const item = await Item.findByPk(id);
        if (!item) {
            req.session.error = 'Item not found.';
            return res.redirect('back');
        }
        
        // Try to delete files
        const fs = require('fs');
        const path = require('path');
        if (item.image_url) {
            const coverPath = path.join(__dirname, '../public', item.image_url);
            if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
        }
        if (item.file_path) {
            const materialPath = path.join(__dirname, '../public', item.file_path);
            if (fs.existsSync(materialPath)) fs.unlinkSync(materialPath);
        }

        await item.destroy();
        req.session.success = 'Item deleted successfully.';
        res.redirect('back');
    } catch (error) {
        console.error(error);
        req.session.error = 'Failed to delete item.';
        res.redirect('back');
    }
};
