require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const fs = require('fs');

let sequelize;
if (process.env.DATABASE_URL) {
  const pg = require('pg');
  sequelize = new Sequelize(process.env.DATABASE_URL, {
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

// Sync database automatically
sequelize.sync().then(() => {
    console.log("Database synced");
}).catch(console.error);

module.exports = { sequelize, User, Item, Purchase, Recharge };
