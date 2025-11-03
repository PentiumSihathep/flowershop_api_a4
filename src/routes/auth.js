// File: src/routes/auth.js
// Auth routes for Flower Shop API (v3 plan)
// - POST /auth/register   (customer self-register)
// - POST /auth/login      (login any user: customer/staff/admin)
// - GET  /auth/me         (profile from JWT)

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../models');
const config = require('../config/config');
const logger = require('../logger');

const router = express.Router();
const { User } = db;

// ---- helpers ----
const signToken = (payload) =>
  jwt.sign(payload, config.auth.jwtSecret, { expiresIn: '7d', algorithm: 'HS512' });

const requireAuth = (req, res, next) => {
  try {
    const header = req.header('Authorization') || req.header('authorization');
    if (!header || !header.startsWith('Bearer ')) {
      logger.warn('Auth: missing token', { ip: req.ip, url: req.originalUrl });
      return res.status(401).json({ errors: [{ msg: 'No token supplied' }] });
    }
    const token = header.replace('Bearer ', '').trim();
    const decoded = jwt.verify(token, config.auth.jwtSecret);
    req.user = decoded;
    next();
  } catch (e) {
    logger.error('Auth: invalid token', { ip: req.ip, url: req.originalUrl, error: e.message });
    return res.status(401).json({ errors: [{ msg: 'Token is invalid' }] });
  }
};

// ----------------------
// POST /auth/register (customer)
// ----------------------
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body || {};

  try {
    if (!name || !email || !password) {
      logger.warn('Register: missing fields', { email });
      return res.status(400).json({ errors: [{ msg: 'name, email, and password are required' }] });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      logger.warn('Register: email already used', { email });
      return res.status(400).json({ errors: [{ msg: 'User already registered' }] });
    }

    const passwordHash = await bcrypt.hash(password, 11);
    const user = await User.create({
      name,
      email,
      passwordHash,
      role: 'customer',
      isActive: true
    });

    const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
    const token = signToken(payload);

    logger.info('Register: customer created', { userId: user.id, email });
    return res.status(201).json({ token });
  } catch (err) {
    logger.error('Register: server error', { email, error: err.message });
    return res.status(500).json({ errors: [{ msg: 'Server Error' }] });
  }
});

// ----------------------
// POST /auth/login (any role)
// ----------------------
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  try {
    if (!email || !password) {
      logger.warn('Login: missing fields', { email });
      return res.status(400).json({ errors: [{ msg: 'email and password are required' }] });
    }

    const user = await User.findOne({ where: { email, isActive: true } });
    if (!user) {
      logger.warn('Login: invalid credentials (no user)', { email });
      return res.status(400).json({ errors: [{ msg: 'Invalid Credentials' }] });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      logger.warn('Login: invalid credentials (password mismatch)', { userId: user.id, email });
      return res.status(400).json({ errors: [{ msg: 'Invalid Credentials' }] });
    }

    const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
    const token = signToken(payload);

    logger.info('Login: success', { userId: user.id, role: user.role });
    return res.status(200).json({ token });
  } catch (err) {
    logger.error('Login: server error', { email, error: err.message });
    return res.status(500).json({ errors: [{ msg: 'Server Error' }] });
  }
});

// ----------------------
// GET /auth/me (from JWT)
// ----------------------
router.get('/me', requireAuth, async (req, res) => {
  try {
    const me = await User.findByPk(req.user.id);
    if (!me || !me.isActive) {
      logger.warn('Me: user not found/inactive', { userId: req.user.id });
      return res.status(404).json({ errors: [{ msg: 'User not found' }] });
    }
    logger.info('Me: fetched profile', { userId: me.id, role: me.role });
    return res.status(200).json({
      id: me.id,
      email: me.email,
      name: me.name,
      role: me.role
    });
  } catch (err) {
    logger.error('Me: server error', { userId: req.user?.id, error: err.message });
    return res.status(500).json({ errors: [{ msg: 'Server Error' }] });
  }
});

module.exports = router;