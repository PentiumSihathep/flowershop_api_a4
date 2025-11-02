// File: models/index.js
// Flower Shop API – Sequelize models (CommonJS)

const { Sequelize, DataTypes } = require('sequelize');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const config = require('../config/config');

const db = {};

// Initialise sequelize using your existing config pattern
const sequelize = new Sequelize(
  config.db.database,
  config.db.user,
  config.db.password,
  config.db.options
);

// ---- User (auth: admin | staff | customer) ----
const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
  name: { type: DataTypes.STRING, allowNull: false },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('admin', 'staff', 'customer'), defaultValue: 'customer' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  tableName: 'users',
  underscored: true
});

// Helper methods (mirror your style)
User.prototype.signToken = function (payload) {
  return jwt.sign(payload, config.auth.jwtSecret, { expiresIn: '7d', algorithm: 'HS512' });
};
User.prototype.hashPassword = async function (plain) {
  const salt = await bcrypt.genSalt(11);
  return bcrypt.hash(plain, salt);
};
User.prototype.comparePassword = function (candidate, hash = this.passwordHash) {
  return bcrypt.compare(candidate, hash);
};

// ---- Flower (catalog/inventory) ----
const Flower = sequelize.define('Flower', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  stock: { type: DataTypes.INTEGER, defaultValue: 0 },
  category: { type: DataTypes.STRING },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  tableName: 'flowers',
  underscored: true,
  defaultScope: { where: { isActive: true } },
  scopes: { all: { where: {} } }
});

// ---- Customer (CRM profile managed by staff) ----
const Customer = sequelize.define('Customer', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  address: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  tableName: 'customers',
  underscored: true,
  defaultScope: { where: { isActive: true } },
  scopes: { all: { where: {} } }
});

// ---- Order & OrderItem (many-to-many) ----
const Order = sequelize.define('Order', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  customerId: { type: DataTypes.INTEGER, allowNull: false },
  status: {
    type: DataTypes.ENUM('pending', 'paid', 'shipped', 'delivered', 'cancelled'),
    defaultValue: 'pending'
  },
  total: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 },
  notes: { type: DataTypes.TEXT }
}, {
  tableName: 'orders',
  underscored: true
});

const OrderItem = sequelize.define('OrderItem', {
  // Composite (orderId, flowerId) is typical, but Sequelize also allows id-less join with PKs
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false } // unit price at time of sale
}, {
  tableName: 'order_items',
  underscored: true
});

// ---- Associations ----
Customer.hasMany(Order, { foreignKey: 'customerId', onDelete: 'RESTRICT' });
Order.belongsTo(Customer, { foreignKey: 'customerId' });

Order.belongsToMany(Flower, { through: OrderItem, foreignKey: 'orderId' });
Flower.belongsToMany(Order, { through: OrderItem, foreignKey: 'flowerId' });

// ---- Export (compatible with your base) ----
db.sequelize = sequelize;
db.Sequelize = Sequelize;

db.User = User;
db.Flower = Flower;
db.Customer = Customer;
db.Order = Order;
db.OrderItem = OrderItem;

module.exports = db;
module.exports.Op = Sequelize.Op;