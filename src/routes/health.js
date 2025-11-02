// src/routes/health.js
// Simple health check for uptime/ALB

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', ts: new Date().toISOString() });
});

module.exports = router;