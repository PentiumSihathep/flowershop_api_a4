// File: src/routes/flowers.js
// Private + public routes for managing flowers and inventory.

const express = require('express');
const db = require('../models');
const auth = require('../middleware/auth');   // verifies JWT
const staff = require('../middleware/staff'); // restricts to staff/admin
const logger = require('../logger');          // ✅ added Winston logger

const router = express.Router();
const { Flower } = db; // from models/index.js

// ----------------------
// GET /flowers – Public catalog (anyone can view)
// ----------------------
router.get('/', async (req, res) => {
  try {
    const { q, category, minPrice, maxPrice, page = 1, pageSize = 20 } = req.query;
    const where = {};

    if (category) where.category = category;
    if (q) where.name = { [db.Sequelize.Op.like]: `%${q}%` };
    if (minPrice || maxPrice) {
      where.price = {
        ...(minPrice && { [db.Sequelize.Op.gte]: parseFloat(minPrice) }),
        ...(maxPrice && { [db.Sequelize.Op.lte]: parseFloat(maxPrice) }),
      };
    }

    const limit = Number(pageSize);
    const offset = (Number(page) - 1) * limit;

    const { count, rows } = await Flower.findAndCountAll({
      where: { ...where, isActive: true },
      limit,
      offset,
      order: [['id', 'DESC']],
      attributes: ['id', 'name', 'description', 'price', 'stock', 'category', 'isActive'],
    });

    logger.info('🌼 Flowers retrieved', { total: count, page, pageSize });
    res.status(200).json({
      data: rows,
      meta: { total: count, page: Number(page), pageSize: limit },
    });
  } catch (err) {
    logger.error('Failed to fetch flowers', { error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// ----------------------
// GET /flowers/:id – Get single flower (public)
// ----------------------
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const flower = await Flower.findByPk(id, {
      attributes: ['id', 'name', 'description', 'price', 'stock', 'category', 'isActive'],
    });

    if (!flower || !flower.isActive) {
      logger.warn('Flower not found', { id });
      return res.status(404).json({ msg: 'Flower not found' });
    }

    logger.info('🌸 Flower retrieved', { id, name: flower.name });
    res.status(200).json(flower);
  } catch (err) {
    logger.error('Failed to get flower', { id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// ----------------------
// POST /flowers – Add a new flower (staff/admin only)
// ----------------------
router.post('/', [auth, staff], async (req, res) => {
  const { name, description, price, stock, category } = req.body;
  try {
    if (!name || !price) {
      logger.warn('Flower creation missing required fields', { body: req.body });
      return res.status(400).json({ msg: 'name and price are required' });
    }

    const flower = await Flower.create({
      name,
      description,
      price,
      stock: stock || 0,
      category,
    });

    logger.info('🌻 Flower created', { id: flower.id, name: flower.name, price: flower.price });
    res.status(201).json(flower);
  } catch (err) {
    logger.error('Failed to create flower', { error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// ----------------------
// PUT /flowers/:id – Update flower (staff/admin only)
// ----------------------
router.put('/:id', [auth, staff], async (req, res) => {
  const id = Number(req.params.id);
  try {
    const flower = await Flower.findByPk(id);
    if (!flower || !flower.isActive) {
      logger.warn('Flower not found for update', { id });
      return res.status(404).json({ msg: 'Flower not found' });
    }

    await flower.update(req.body);
    logger.info('🌼 Flower updated', { id, fields: Object.keys(req.body) });
    res.status(200).json(flower);
  } catch (err) {
    logger.error('Failed to update flower', { id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// ----------------------
// DELETE /flowers/:id – Soft delete (admin only)
// ----------------------
router.delete('/:id', [auth, staff], async (req, res) => {
  const id = Number(req.params.id);
  try {
    const flower = await Flower.findByPk(id);
    if (!flower) {
      logger.warn('Flower not found for delete', { id });
      return res.status(404).json({ msg: 'Flower not found' });
    }

    await flower.update({ isActive: false });
    logger.warn('🪻 Flower deactivated', { id, name: flower.name });
    res.status(204).send();
  } catch (err) {
    logger.error('Failed to delete flower', { id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// ----------------------
// POST /flowers/:id/restock – Adjust stock by delta (staff/admin only)
// ----------------------
router.post('/:id/restock', [auth, staff], async (req, res) => {
  const id = Number(req.params.id);
  const { delta } = req.body;
  try {
    const flower = await Flower.findByPk(id);
    if (!flower || !flower.isActive) {
      logger.warn('Flower not found for restock', { id });
      return res.status(404).json({ msg: 'Flower not found' });
    }

    const newStock = flower.stock + Number(delta || 0);
    if (newStock < 0) {
      logger.warn('Attempted negative stock adjustment', { id, currentStock: flower.stock, delta });
      return res.status(400).json({ msg: 'Resulting stock cannot be negative' });
    }

    await flower.update({ stock: newStock });
    logger.info('🌺 Stock updated', { id, newStock });
    res.status(200).json(flower);
  } catch (err) {
    logger.error('Failed to restock flower', { id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

module.exports = router;