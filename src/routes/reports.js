// File: src/routes/reports.js
// Admin-only business reports

const express = require('express');
const db = require('../models');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const logger = require('../logger'); // ✅ logging

const router = express.Router();
const { Sequelize, Order, OrderItem, Flower } = db;
const { Op } = Sequelize;

// All endpoints require admin
router.use(auth, admin);

// GET /reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns: { totalRevenue, orders, topFlowers: [{ flowerId, name, qty, revenue }] }
router.get('/sales', async (req, res) => {
  try {
    const { from, to } = req.query;
    const where = {};

    // Parse dates safely (ignore invalid)
    const fromDate = from ? new Date(from) : null;
    const toDate   = to   ? new Date(to)   : null;

    if (fromDate && !isNaN(fromDate)) {
      where.createdAt = { ...(where.createdAt || {}), [Op.gte]: fromDate };
    }
    if (toDate && !isNaN(toDate)) {
      where.createdAt = { ...(where.createdAt || {}), [Op.lte]: toDate };
    }

    const orders = await Order.findAll({ where, attributes: ['id', 'total'] });
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const orderCount = orders.length;

    // Top flowers by quantity (and revenue)
    const top = await OrderItem.findAll({
      attributes: [
        'flowerId',
        [Sequelize.fn('SUM', Sequelize.col('quantity')), 'qty'],
        [Sequelize.fn('SUM', Sequelize.literal('quantity * price')), 'revenue']
      ],
      group: ['flowerId', 'Flower.id'],
      include: [{ model: Flower, attributes: ['id', 'name'] }],
      order: [[Sequelize.literal('qty'), 'DESC']],
      limit: 5
    });

    const topFlowers = top.map(t => ({
      flowerId: t.flowerId,
      name: t.Flower?.name,
      qty: Number(t.get('qty')),
      revenue: Number(t.get('revenue'))
    }));

    logger.info('Reports: sales generated', {
      adminId: req.user.id,
      from: from || null,
      to: to || null,
      totalRevenue,
      orders: orderCount
    });

    res.status(200).json({ totalRevenue, orders: orderCount, topFlowers });
  } catch (err) {
    logger.error('Reports: sales failed', { adminId: req.user?.id, error: err.message });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

module.exports = router;