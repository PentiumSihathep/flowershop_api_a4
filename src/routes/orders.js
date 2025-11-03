// File: src/routes/orders.js
// Private routes for managing customer orders (admin/staff only)

const express = require('express');
const db = require('../models');
const auth = require('../middleware/auth');
const staff = require('../middleware/staff');
const logger = require('../logger'); // add logger

const router = express.Router();
const { Order, OrderItem, Customer, Flower, sequelize } = db;

// ----------------------
// GET /orders – List all orders (admin/staff only)
// ----------------------
router.get('/', [auth, staff], async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const limit = Number(pageSize);
    const offset = (Number(page) - 1) * limit;

    const { count, rows } = await Order.findAndCountAll({
      include: [
        { model: Customer, attributes: ['id', 'name', 'email'] },
        { model: Flower, through: { attributes: ['quantity', 'price'] } }
      ],
      limit,
      offset,
      order: [['id', 'DESC']]
    });

    logger.info('Orders listed', { total: count, page: Number(page), pageSize: limit });
    res.status(200).json({
      data: rows,
      meta: { total: count, page: Number(page), pageSize: limit }
    });
  } catch (err) {
    logger.error('Orders list failed', { error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// ----------------------
// GET /orders/:id – Get single order by ID
// ----------------------
router.get('/:id', [auth, staff], async (req, res) => {
  const id = Number(req.params.id);
  try {
    const order = await Order.findByPk(id, {
      include: [
        { model: Customer, attributes: ['id', 'name', 'email'] },
        { model: Flower, through: { attributes: ['quantity', 'price'] } }
      ]
    });

    if (!order) {
      logger.warn('Order not found', { id });
      return res.status(404).json({ msg: 'Order not found' });
    }

    logger.info('Order retrieved', { id });
    res.status(200).json(order);
  } catch (err) {
    logger.error('Get order failed', { id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// ----------------------
// POST /orders – Create new order (staff/admin only)
// ----------------------
router.post('/', [auth, staff], async (req, res) => {
  const { customerId, items, notes } = req.body;

  if (!customerId || !Array.isArray(items) || items.length === 0) {
    logger.warn('Create order missing fields', { hasCustomerId: !!customerId, itemsCount: Array.isArray(items) ? items.length : 0 });
    return res.status(400).json({ msg: 'customerId and items are required' });
  }

  const transaction = await sequelize.transaction();
  try {
    // Verify customer exists & active
    const customer = await Customer.findByPk(customerId, { transaction });
    if (!customer || !customer.isActive) {
      await transaction.rollback();
      logger.warn('Create order invalid customer', { customerId });
      return res.status(400).json({ msg: 'Invalid customer' });
    }

    // Create order shell
    const order = await Order.create({ customerId, notes, status: 'pending', total: 0 }, { transaction });

    let total = 0;
    for (const { flowerId, quantity } of items) {
      const flower = await Flower.findByPk(flowerId, { transaction, lock: true });
      if (!flower || !flower.isActive) {
        await transaction.rollback();
        logger.warn('Create order flower not found', { orderId: order.id, flowerId });
        return res.status(400).json({ msg: `Flower ID ${flowerId} not found` });
      }
      if (flower.stock < quantity) {
        await transaction.rollback();
        logger.warn('Create order insufficient stock', { orderId: order.id, flowerId, requested: quantity, stock: flower.stock });
        return res.status(400).json({ msg: `Insufficient stock for ${flower.name}` });
      }

      const price = Number(flower.price);
      total += price * quantity;

      await OrderItem.create(
        { orderId: order.id, flowerId, quantity, price },
        { transaction }
      );

      await flower.update(
        { stock: flower.stock - quantity },
        { transaction }
      );
    }

    await order.update({ total }, { transaction });
    await transaction.commit();

    const fullOrder = await Order.findByPk(order.id, {
      include: [
        { model: Customer, attributes: ['id', 'name', 'email'] },
        { model: Flower, through: { attributes: ['quantity', 'price'] } }
      ]
    });

    logger.info('Order created', { orderId: order.id, customerId, itemsCount: items.length, total });
    res.status(201).json(fullOrder);
  } catch (err) {
    await transaction.rollback();
    logger.error('Create order failed', { customerId, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// ----------------------
// PATCH /orders/:id/status – Update order status
// ----------------------
router.patch('/:id/status', [auth, staff], async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;

  const validStatuses = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    logger.warn('Update status invalid value', { id, status });
    return res.status(400).json({ msg: 'Invalid status' });
  }

  try {
    const order = await Order.findByPk(id);
    if (!order) {
      logger.warn('Update status order not found', { id });
      return res.status(404).json({ msg: 'Order not found' });
    }

    await order.update({ status });
    logger.info('Order status updated', { id, status });
    res.status(200).json(order);
  } catch (err) {
    logger.error('Update status failed', { id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// ----------------------
// DELETE /orders/:id – Cancel/Delete an order (admin only)
// ----------------------
router.delete('/:id', [auth, staff], async (req, res) => {
  const id = Number(req.params.id);
  try {
    const order = await Order.findByPk(id);
    if (!order) {
      logger.warn('Delete order not found', { id });
      return res.status(404).json({ msg: 'Order not found' });
    }

    await order.destroy();
    logger.warn('Order deleted', { id });
    res.status(204).send();
  } catch (err) {
    logger.error('Delete order failed', { id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

module.exports = router;