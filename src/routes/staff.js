// File: src/routes/staff.js
// Admin-only routes for managing staff/admin users

const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../models');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const logger = require('../logger'); // ✅ logging

const router = express.Router();
const { User, Sequelize } = db;
const { Op } = Sequelize;

// All endpoints require admin
router.use(auth, admin);

// GET /staff – list staff/admin users
router.get('/', async (req, res) => {
  try {
    const list = await User.findAll({
      where: { isActive: true, role: { [Op.in]: ['staff', 'admin'] } }, // ✅ Op.in
      order: [['id', 'DESC']],
      attributes: ['id', 'email', 'name', 'role', 'isActive']
    });
    logger.info('Staff list retrieved', { count: list.length, adminId: req.user.id });
    res.status(200).json(list);
  } catch (err) {
    logger.error('Staff list failed', { error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// GET /staff/:id – get one staff/admin
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const u = await User.findByPk(id);
    if (!u || !u.isActive || u.role === 'customer') {
      logger.warn('Staff get not found', { id });
      return res.status(404).json({ msg: 'Staff not found' });
    }
    logger.info('Staff retrieved', { id });
    res.status(200).json({ id: u.id, email: u.email, name: u.name, role: u.role, isActive: u.isActive });
  } catch (err) {
    logger.error('Staff get failed', { id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// POST /staff – create staff/admin
router.post('/', async (req, res) => {
  try {
    const { email, name, password, role = 'staff' } = req.body || {};
    if (!email || !name || !password) {
      logger.warn('Staff create missing fields', { hasEmail: !!email, hasName: !!name });
      return res.status(400).json({ msg: 'email, name and password are required' });
    }
    if (!['staff', 'admin'].includes(role)) {
      logger.warn('Staff create invalid role', { role });
      return res.status(400).json({ msg: 'role must be staff or admin' });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      logger.warn('Staff create duplicate email', { email });
      return res.status(400).json({ msg: 'Email already used' });
    }

    const passwordHash = await bcrypt.hash(password, 11);
    const user = await User.create({ email, name, passwordHash, role, isActive: true });

    logger.info('Staff created', { id: user.id, role: user.role, by: req.user.id });
    res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
  } catch (err) {
    logger.error('Staff create failed', { error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// PUT /staff/:id – update staff/admin
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const u = await User.findByPk(id);
    if (!u || !u.isActive || u.role === 'customer') {
      logger.warn('Staff update not found', { id });
      return res.status(404).json({ msg: 'Staff not found' });
    }

    const { name, email, role } = req.body || {};
    if (role && !['staff', 'admin'].includes(role)) {
      logger.warn('Staff update invalid role', { id, role });
      return res.status(400).json({ msg: 'role must be staff or admin' });
    }

    await u.update({ name: name ?? u.name, email: email ?? u.email, role: role ?? u.role });
    logger.info('Staff updated', { id, fields: Object.keys(req.body || {}) });
    res.status(200).json({ id: u.id, email: u.email, name: u.name, role: u.role });
  } catch (err) {
    logger.error('Staff update failed', { id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// DELETE /staff/:id – deactivate (soft delete)
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const u = await User.findByPk(id);
    if (!u || u.role === 'customer') {
      logger.warn('Staff delete not found', { id });
      return res.status(404).json({ msg: 'Staff not found' });
    }
    await u.update({ isActive: false });
    logger.warn('Staff deactivated', { id, by: req.user.id });
    res.status(204).send();
  } catch (err) {
    logger.error('Staff delete failed', { id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

module.exports = router;