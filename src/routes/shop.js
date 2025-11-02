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

// ---- Helpers ----
function isSeqValidation(err) {
  return err?.name === 'SequelizeValidationError' || err?.name === 'SequelizeUniqueConstraintError';
}

// Ensure a Customer row exists for this user (CRM profile)
async function getOrCreateCustomerProfile(user, t) {
  if (!user?.email) {
    const msg = 'Authenticated user is missing an email';
    logger.error('Shop: CRM lookup failed - no email on JWT', { userId: user?.id });
    const e = new Error(msg);
    e.status = 400;
    throw e;
  }

  // Search across ALL records (ignore default scope)
  const [c, created] = await Customer.unscoped().findOrCreate({
    where: { email: user.email },
    defaults: {
      name: user.name || user.email.split('@')[0],
      email: user.email,
      isActive: true,
    },
    transaction: t,
  });

  if (!created && !c.isActive) {
    await c.update(
      { isActive: true, name: c.name || user.name || user.email.split('@')[0] },
      { transaction: t }
    );
    logger.info('Shop: CRM profile reactivated', { customerId: c.id, email: user.email });
  } else if (created) {
    logger.info('Shop: CRM profile created', { customerId: c.id, email: user.email });
  }

  return c;
}

// ----------------------
// POST /api/v1/shop/orders  (customer creates order)
// ----------------------
router.post('/orders', [auth, requireCustomer], async (req, res) => {
  const {
    items,
    fulfilment,
    deliveryAddress,
    deliveryDate,
    contactPhone,
    giftMessage,
    notes,
  } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    logger.warn('Shop: create order missing items', { userId: req.user.id });
    return res.status(400).json({ msg: 'items are required' });
  }
  if (!contactPhone) {
    logger.warn('Shop: create order missing contactPhone', { userId: req.user.id });
    return res.status(400).json({ msg: 'contactPhone is required' });
  }
  const fulfil = fulfilment === 'delivery' ? 'delivery' : 'pickup';

  const t = await sequelize.transaction();
  try {
    // CRM profile
    const customer = await getOrCreateCustomerProfile(req.user, t);

    // Create order (stash extra info in notes for MVP)
    const extra = {
      fulfilment: fulfil,
      deliveryAddress: deliveryAddress || null,
      deliveryDate: deliveryDate || null,
      contactPhone,
      giftMessage: giftMessage || null,
      clientNotes: notes || null,
    };

    const order = await Order.create(
      { customerId: customer.id, notes: JSON.stringify(extra), status: 'pending', total: 0 },
      { transaction: t }
    );

    // Items & stock
    let total = 0;

    // Normalise items: flatten accidental nesting and merge duplicates by flowerId
    const merged = new Map(); // flowerId -> totalQty
    for (const raw of (Array.isArray(items) ? items.flat() : [])) {
      const fid = Number(raw?.flowerId);
      const qty = Number(raw?.quantity || 0);
      if (!fid || qty < 1) {
        await t.rollback();
        logger.warn('Shop: invalid item payload', { orderId: order.id, raw });
        return res.status(400).json({ msg: 'Each item needs flowerId and quantity >= 1' });
      }
      merged.set(fid, (merged.get(fid) || 0) + qty);
    }

    for (const [flowerId, q] of merged.entries()) {
      // 🔄 Removed row lock to behave reliably on SQLite
      const flower = await Flower.findByPk(flowerId, { transaction: t });
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

    const full = await Order.findByPk(order.id, {
      include: [{ model: Flower, through: { attributes: ['quantity', 'price'] } }],
    });

    logger.info('Shop: order created', { orderId: order.id, customerId: customer.id, itemsCount: items.length, total });
    return res.status(201).json(full);
  } catch (err) {
    await t.rollback().catch(() => {});
    if (isSeqValidation(err)) {
      logger.warn('Shop: validation error', { details: err.errors?.map(e => e.message) });
      return res.status(400).json({
        msg: 'Validation error',
        errors: err.errors?.map(e => e.message) || [err.message],
      });
    }
    const status = err.status || 500;
    logger.error('Shop: create order failed', { userId: req.user?.id, error: err.message });
    return res.status(status).json({ msg: status === 500 ? 'Server error' : err.message, error: err.message });
  }
});

// ----------------------
// GET /api/v1/shop/orders  (list my orders)
// ----------------------
router.get('/orders', [auth, requireCustomer], async (req, res) => {
  try {
    const customer = await Customer.unscoped().findOne({ where: { email: req.user.email } });
    if (!customer) {
      logger.info('Shop: no CRM profile yet', { userEmail: req.user.email });
      return res.status(200).json({ data: [], meta: { total: 0, page: 1, pageSize: 0 } });
    }

    const list = await Order.findAll({
      where: { customerId: customer.id },
      order: [['id', 'DESC']],
      include: [{ model: Flower, through: { attributes: ['quantity', 'price'] } }],
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
    const customer = await Customer.unscoped().findOne({ where: { email: req.user.email } });
    if (!customer) {
      logger.warn('Shop: order lookup with no CRM profile', { userEmail: req.user.email });
      return res.status(404).json({ msg: 'Order not found' });
    }

    const order = await Order.findByPk(id, {
      include: [{ model: Flower, through: { attributes: ['quantity', 'price'] } }],
    });
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