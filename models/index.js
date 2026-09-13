require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const fs = require('fs');

let sequelize;
const dbUrl = process.env.NEON_DATABASE_URL ||
              process.env.NEON_POSTGRES_URL ||
              process.env.STORAGE_URL || 
              process.env.STORAGE_POSTGRES_URL || 
              process.env.STORAGE_DATABASE_URL || 
              process.env.POSTGRES_URL || 
              (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('eynpinsmjajduwrvkrrh') ? process.env.DATABASE_URL : null);

if (dbUrl) {
  const pg = require('pg');
  sequelize = new Sequelize(dbUrl, {
    dialect: 'postgres',
    dialectModule: pg,
    protocol: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false
  });
} else {
  let dbPath = path.join(__dirname, '../database.sqlite');
  if (process.env.VERCEL === '1') {
    dbPath = '/tmp/database.sqlite';
    const bundledDb = path.join(__dirname, '../database.sqlite');
    if (!fs.existsSync(dbPath) && fs.existsSync(bundledDb)) {
      try {
        fs.copyFileSync(bundledDb, dbPath);
      } catch (e) {
        console.error('Failed to copy bundled sqlite to /tmp:', e);
      }
    }
  }

  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false
  });
}

const User = sequelize.define('User', {
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, defaultValue: 'student' },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  is_admin: { type: DataTypes.BOOLEAN, defaultValue: false },
  balance: { type: DataTypes.INTEGER, defaultValue: 0 },
  avatar_url: { type: DataTypes.STRING, allowNull: true }
});

const Item = sequelize.define('Item', {
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  category: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.INTEGER, allowNull: false },
  image_url: { type: DataTypes.STRING, allowNull: true },
  file_path: { type: DataTypes.STRING, allowNull: true },
  instructor_id: { type: DataTypes.INTEGER, allowNull: true }
});

const Purchase = sequelize.define('Purchase', {
  amount: { type: DataTypes.INTEGER, allowNull: false }
});

const Recharge = sequelize.define('Recharge', {
  amount: { type: DataTypes.INTEGER, allowNull: false },
  method: { type: DataTypes.STRING, defaultValue: 'paymob' },
  status: { type: DataTypes.STRING, defaultValue: 'pending' },
  paymob_order_id: { type: DataTypes.STRING, allowNull: true }
});

// Relationships
User.hasMany(Purchase, { foreignKey: 'user_id' });
Purchase.belongsTo(User, { foreignKey: 'user_id' });

Item.hasMany(Purchase, { foreignKey: 'item_id' });
Purchase.belongsTo(Item, { foreignKey: 'item_id' });

User.hasMany(Recharge, { foreignKey: 'user_id' });
Recharge.belongsTo(User, { foreignKey: 'user_id' });

const bcrypt = require('bcryptjs');

// Sync database automatically
sequelize.sync({ alter: true }).then(async () => {
    console.log("Database synced");
    try {
        const userCount = await User.count();
        if (userCount === 0) {
            const hashedPassword = await bcrypt.hash('123456', 10);
            await User.create({
                name: 'Admin User',
                email: 'admin@system.com',
                password: hashedPassword,
                role: 'admin',
                is_admin: true,
                is_active: true
            });
            await User.create({
                name: 'Dr. Ahmed',
                email: 'doctor@system.com',
                password: hashedPassword,
                role: 'doctor',
                is_admin: false,
                is_active: true
            });
            await User.create({
                name: 'Student User',
                email: 'student@system.com',
                password: hashedPassword,
                role: 'student',
                is_admin: false,
                is_active: true,
                balance: 500
            });
            await User.create({
                name: 'عبدالله محمد علي حسن',
                email: '2420766',
                password: hashedPassword,
                role: 'student',
                is_admin: false,
                is_active: true,
                balance: 300
            });
            console.log("Auto-seeded initial users.");
        }
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
            console.log("Auto-seeded initial items.");
        }
    } catch (e) {
        console.error("Auto-seed error:", e);
    }
}).catch(console.error);

module.exports = { sequelize, User, Item, Purchase, Recharge };
