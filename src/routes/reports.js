// File: src/routes/reports.js
// Admin-only business reports

const express = require('express');
const db = require('../models');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const logger = require('../logger');

const router = express.Router();
const { Sequelize, Order, OrderItem, Flower } = db;
const { Op } = Sequelize;

router.use(auth, admin);

// GET /reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/sales', async (req, res) => {
  try {
    const { from, to } = req.query;

    // Optional date range on Order.createdAt
    const where = {};
    const fromDate = from ? new Date(from) : null;
    const toDate   = to   ? new Date(to)   : null;
    if (fromDate && !isNaN(fromDate)) where.createdAt = { ...(where.createdAt || {}), [Op.gte]: fromDate };
    if (toDate   && !isNaN(toDate))   where.createdAt = { ...(where.createdAt || {}), [Op.lte]: toDate   };

    // Totals via orders table
    const orders = await Order.findAll({ where, attributes: ['id', 'total'] });
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const orderCount = orders.length;

    // Top flowers — fully qualify with the Sequelize alias "OrderItem"
    const top = await OrderItem.findAll({
      attributes: [
        'flowerId',
        [Sequelize.fn('SUM', Sequelize.col('OrderItem.quantity')), 'qty'],
        [Sequelize.literal('SUM("OrderItem"."quantity" * "OrderItem"."price")'), 'revenue']
      ],
      include: [
        { model: Flower, attributes: ['id', 'name'] },
        { model: Order, attributes: [], where } // apply date range
      ],
      group: ['flowerId', 'Flower.id'],
      order: [[Sequelize.literal('qty'), 'DESC']],
      limit: 5
    });

    const topFlowers = top.map(t => ({
      flowerId: t.flowerId,
      name: t.Flower?.name,
      qty: Number(t.get('qty') || 0),
      revenue: Number(t.get('revenue') || 0)
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