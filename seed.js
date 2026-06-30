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
                is_active: true
            }
        });
        console.log('Student account created: student@system.com (Password: 123456)');

        console.log('All accounts seeded successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    }
}

seed();
