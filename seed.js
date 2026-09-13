const bcrypt = require('bcrypt');
const { User, sequelize } = require('./models');

async function seed() {
    try {
        await sequelize.authenticate();
        console.log('Connected to database.');

        // Passwords for all accounts will be '123456'
        const hashedPassword = await bcrypt.hash('123456', 10);

        // 1. Admin Account
        await User.findOrCreate({
            where: { email: 'admin@system.com' },
            defaults: {
                name: 'Admin User',
                password: hashedPassword,
                role: 'admin',
                is_admin: true,
                is_active: true
            }
        });
        console.log('Admin account created: admin@system.com (Password: 123456)');

        // 2. Doctor Account
        await User.findOrCreate({
            where: { email: 'doctor@system.com' },
            defaults: {
                name: 'Dr. Ahmed',
                password: hashedPassword,
                role: 'doctor',
                is_admin: false,
                is_active: true
            }
        });
        console.log('Doctor account created: doctor@system.com (Password: 123456)');

        // 3. Student Account
        await User.findOrCreate({
            where: { email: 'student@system.com' },
            defaults: {
                name: 'Student User',
                password: hashedPassword,
                role: 'student',
                is_admin: false,
                is_active: true,
                balance: 500
            }
        });
        console.log('Student account created: student@system.com (Password: 123456)');

        // 4. University Student by ID
        await User.findOrCreate({
            where: { email: '2420766' },
            defaults: {
                name: 'عبدالله محمد علي حسن',
                password: hashedPassword,
                role: 'student',
                is_admin: false,
                is_active: true,
                balance: 300
            }
        });
        console.log('University Student created: 2420766 (Password: 123456)');

        // 5. Sample Store Items
        const { Item } = require('./models');
        const itemCount = await Item.count();
        if (itemCount === 0) {
            await Item.bulkCreate([
                {
                    name: 'Physics 101 Summary',
                    description: 'ملخص شامل لمادة الفيزياء الترم الأول',
                    category: 'Notes',
                    price: 150,
                    image_url: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=600&q=80',
                    file_path: '#'
                },
                {
                    name: 'Computer Architecture Lectures',
                    description: 'محاضرات وسكاشن مادة عمارة الحاسب بالكامل',
                    category: 'Video Lectures',
                    price: 250,
                    image_url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80',
                    file_path: '#'
                },
                {
                    name: 'Mathematics 1 Previous Exams',
                    description: 'امتحانات السنوات السابقة مع نماذج الإجابة',
                    category: 'Exams',
                    price: 100,
                    image_url: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=600&q=80',
                    file_path: '#'
                }
            ]);
            console.log('Sample store items seeded successfully!');
        }

        console.log('All accounts and items seeded successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    }
}

seed();
