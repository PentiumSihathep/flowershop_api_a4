// File: src/routes/shop.js
// Customer-facing shop routes (place & view own orders)

const express = require('express');
const db = require('../models');
const auth = require('../middleware/auth'); // verifies JWT and sets req.user
const logger = require('../logger');        // ✅ add logger

const router = express.Router();
const { sequelize, Customer, Order, OrderItem, Flower } = db;

// Require a logged-in user with role 'customer'
function requireCustomer(req, res, next) {
  if (!req.user) {
    logger.warn('Shop: unauthorised (no user)', { ip: req.ip, url: req.originalUrl });
    return res.status(401).json({ msg: 'Unauthorised' });
  }
  if (req.user.role !== 'customer') {
    logger.warn('Shop: forbidden (non-customer)', { userId: req.user.id, role: req.user.role });
    return res.status(403).json({ msg: 'Customers only' });
  }
  next();
}

// Ensure a Customer row exists for this user (CRM profile)
async function getOrCreateCustomerProfile(user, t) {
  let c = await Customer.findOne({ where: { email: user.email }, transaction: t });
  if (!c) {
    c = await Customer.create(
      { name: user.name || user.email.split('@')[0], email: user.email, isActive: true },
      { transaction: t }
    );
    logger.info('Shop: CRM profile created', { userEmail: user.email, customerId: c.id });
  }
  return c;
}

// ----------------------
// POST /api/v1/shop/orders  (customer creates order)
// ----------------------
router.post('/orders', [auth, requireCustomer], async (req, res) => {
  const { items, fulfilment, deliveryAddress, deliveryDate, contactPhone, giftMessage, notes } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    logger.warn('Shop: create order missing items', { userId: req.user.id });
    return res.status(400).json({ msg: 'items are required' });
  }
  if (!contactPhone) {
    logger.warn('Shop: create order missing contactPhone', { userId: req.user.id });
    return res.status(400).json({ msg: 'contactPhone is required' });
  }
  if (!['pickup', 'delivery'].includes(fulfilment || 'pickup')) {
    logger.warn('Shop: invalid fulfilment', { userId: req.user.id, fulfilment });
    return res.status(400).json({ msg: 'fulfilment must be pickup or delivery' });
  }

  const t = await sequelize.transaction();
  try {
    // CRM profile
    const customer = await getOrCreateCustomerProfile(req.user, t);

    // Create order (stash extra info in notes for MVP)
    const extra = {
      fulfilment: fulfilment || 'pickup',
      deliveryAddress: deliveryAddress || null,
      deliveryDate: deliveryDate || null,
      contactPhone,
      giftMessage: giftMessage || null,
      clientNotes: notes || null
    };
    const order = await Order.create({ customerId: customer.id, notes: JSON.stringify(extra), status: 'pending', total: 0 }, { transaction: t });

    // Items & stock
    let total = 0;
    for (const { flowerId, quantity } of items) {
      const q = Number(quantity || 0);
      if (!flowerId || q < 1) {
        await t.rollback();
        logger.warn('Shop: invalid item payload', { orderId: order.id, flowerId, quantity });
        return res.status(400).json({ msg: 'Each item needs flowerId and quantity >= 1' });
      }

      // lock row to prevent oversell
      const flower = await Flower.findByPk(flowerId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!flower || !flower.isActive) {
        await t.rollback();
        logger.warn('Shop: flower unavailable', { orderId: order.id, flowerId });
        return res.status(400).json({ msg: `Flower ${flowerId} unavailable` });
      }
      if (flower.stock < q) {
        await t.rollback();
        logger.warn('Shop: insufficient stock', { orderId: order.id, flowerId, requested: q, stock: flower.stock });
        return res.status(400).json({ msg: `Insufficient stock for ${flower.name}` });
      }

      const price = Number(flower.price);
      total += price * q;

      await OrderItem.create({ orderId: order.id, flowerId, quantity: q, price }, { transaction: t });
      await flower.update({ stock: flower.stock - q }, { transaction: t });
    }

    await order.update({ total }, { transaction: t });
    await t.commit();

    const full = await Order.findByPk(order.id, { include: [{ model: Flower }] });
    logger.info('Shop: order created', { orderId: order.id, customerId: customer.id, itemsCount: items.length, total });
    res.status(201).json(full);
  } catch (err) {
    await t.rollback();
    logger.error('Shop: create order failed', { userId: req.user.id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// ----------------------
// GET /api/v1/shop/orders  (list my orders)
// ----------------------
router.get('/orders', [auth, requireCustomer], async (req, res) => {
  try {
    const customer = await Customer.findOne({ where: { email: req.user.email } });
    if (!customer) {
      logger.info('Shop: no CRM profile yet', { userEmail: req.user.email });
      return res.status(200).json({ data: [], meta: { total: 0, page: 1, pageSize: 0 } });
    }

    const list = await Order.findAll({
      where: { customerId: customer.id },
      order: [['id', 'DESC']],
      include: [{ model: Flower }]
    });
    logger.info('Shop: my orders listed', { customerId: customer.id, count: list.length });
    res.status(200).json({ data: list, meta: { total: list.length } });
  } catch (err) {
    logger.error('Shop: list my orders failed', { userId: req.user.id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// ----------------------
// GET /api/v1/shop/orders/:id  (view my single order)
// ----------------------
router.get('/orders/:id', [auth, requireCustomer], async (req, res) => {
  const id = Number(req.params.id);
  try {
    const customer = await Customer.findOne({ where: { email: req.user.email } });
    if (!customer) {
      logger.warn('Shop: order lookup with no CRM profile', { userEmail: req.user.email });
      return res.status(404).json({ msg: 'Order not found' });
    }

    const order = await Order.findByPk(id, { include: [{ model: Flower }] });
    if (!order || order.customerId !== customer.id) {
      logger.warn('Shop: order not found or not owner', { requestedId: id, customerId: customer.id });
      return res.status(404).json({ msg: 'Order not found' });
    }

    logger.info('Shop: order retrieved', { orderId: id, customerId: customer.id });
    res.status(200).json(order);
  } catch (err) {
    logger.error('Shop: get my order failed', { userId: req.user.id, orderId: id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

module.exports = router;