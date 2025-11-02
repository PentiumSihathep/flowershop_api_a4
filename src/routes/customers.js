// File: src/routes/customers.js
// Private routes for managing customers (admin/staff only)

const express = require('express');
const db = require('../models');
const auth = require('../middleware/auth');
const staff = require('../middleware/staff');
const logger = require('../logger'); // ✅ add logger

const router = express.Router();
const { Customer, Order } = db;

// ----------------------
// GET /customers – List all customers (staff/admin only)
// ----------------------
router.get('/', [auth, staff], async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;

    const limit = Number(pageSize);
    const offset = (Number(page) - 1) * limit;

    const { count, rows } = await Customer.findAndCountAll({
      limit,
      offset,
      order: [['id', 'DESC']],
      attributes: ['id', 'name', 'email', 'address', 'phone', 'isActive']
    });

    logger.info('Customers listed', { total: count, page: Number(page), pageSize: limit });
    res.status(200).json({
      data: rows,
      meta: { total: count, page: Number(page), pageSize: limit }
    });
  } catch (err) {
    logger.error('Customers list failed', { error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// ----------------------
// GET /customers/:id – Get a single customer (staff/admin only)
// ----------------------
router.get('/:id', [auth, staff], async (req, res) => {
  const id = Number(req.params.id);
  try {
    const customer = await Customer.findByPk(id, {
      attributes: ['id', 'name', 'email', 'address', 'phone', 'isActive']
    });
    if (!customer || !customer.isActive) {
      logger.warn('Customer not found', { id });
      return res.status(404).json({ msg: 'Customer not found' });
    }
    logger.info('Customer retrieved', { id });
    res.status(200).json(customer);
  } catch (err) {
    logger.error('Get customer failed', { id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// ----------------------
// POST /customers – Create new customer (for in-store/phone orders)
// ----------------------
router.post('/', [auth, staff], async (req, res) => {
  const { name, email, phone, address } = req.body || {};
  try {
    if (!name || !email) {
      logger.warn('Create customer missing fields', { name: !!name, email: !!email });
      return res.status(400).json({ msg: 'name and email are required' });
    }

    const existing = await Customer.findOne({ where: { email } });
    if (existing) {
      logger.warn('Create customer duplicate email', { email });
      return res.status(400).json({ msg: 'Customer already exists' });
    }

    const newCustomer = await Customer.create({
      name,
      email,
      phone,
      address,
      isActive: true
    });

    logger.info('Customer created', { id: newCustomer.id, email });
    res.status(201).json(newCustomer);
  } catch (err) {
    logger.error('Create customer failed', { email, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// ----------------------
// PUT /customers/:id – Update customer info (staff/admin only)
// ----------------------
router.put('/:id', [auth, staff], async (req, res) => {
  const id = Number(req.params.id);
  try {
    const customer = await Customer.findByPk(id);
    if (!customer || !customer.isActive) {
      logger.warn('Update customer not found', { id });
      return res.status(404).json({ msg: 'Customer not found' });
    }

    await customer.update(req.body);
    logger.info('Customer updated', { id, fields: Object.keys(req.body || {}) });
    res.status(200).json(customer);
  } catch (err) {
    logger.error('Update customer failed', { id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// ----------------------
// DELETE /customers/:id – Soft delete (admin only)
// ----------------------
router.delete('/:id', [auth, staff], async (req, res) => {
  const id = Number(req.params.id);
  try {
    const customer = await Customer.findByPk(id);
    if (!customer) {
      logger.warn('Delete customer not found', { id });
      return res.status(404).json({ msg: 'Customer not found' });
    }

    await customer.update({ isActive: false });
    logger.warn('Customer deactivated', { id, email: customer.email });
    res.status(204).send();
  } catch (err) {
    logger.error('Delete customer failed', { id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// ----------------------
// GET /customers/:id/orders – Get orders for a specific customer
// ----------------------
router.get('/:id/orders', [auth, staff], async (req, res) => {
  const id = Number(req.params.id);
  try {
    const orders = await Order.findAll({
      where: { customerId: id },
      order: [['id', 'DESC']]
    });
    logger.info('Customer orders listed', { customerId: id, count: orders.length });
    res.status(200).json(orders);
  } catch (err) {
    logger.error('List customer orders failed', { customerId: id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

module.exports = router;