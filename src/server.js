// File: server.js
// Flower Shop API – v3 plan

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const config = require('./config/config');      // expects { port, ... }
const db = require('./models');                 // expects { sequelize, ... }
const logger = require('./logger');             // your winston instance

// ---- Routes (v3 plan) ----
const authRoutes = require('./routes/auth');
const flowerRoutes = require('./routes/flowers');
const customerRoutes = require('./routes/flowers');
const shopRoutes = require('./routes/shop');
const orderRoutes = require('./routes/orders');
const staffRoutes = require('./routes/staff');        // admin-only
const reportRoutes = require('./routes/reports');     // admin-only
const healthRoutes = require('./routes/health');

const app = express();

// ---- Core middleware ----
app.use(helmet());
app.use(cors()); // tighten origins in prod if needed
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- Rate limiting (basic) ----
app.use(
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ---- Morgan + Winston (same pattern as your base) ----
const morganJson = morgan(
  (tokens, req, res) =>
    JSON.stringify({
      method: tokens.method(req, res),
      url: tokens.url(req, res),
      status: Number.parseFloat(tokens.status(req, res)),
      content_length: tokens.res(req, res, 'content-length'),
      response_time: Number.parseFloat(tokens['response-time'](req, res)),
      remote_address: tokens['remote-addr'](req, res),
      remote_user: tokens['remote-user'](req, res),
      date: tokens.date(req, res),
      http_version: tokens['http-version'](req, res),
      user_agent: tokens['user-agent'](req, res),
      referrer: tokens.referrer(req, res),
    }),
  {
    stream: {
      write: (message) => {
        try {
          const data = JSON.parse(message);
          logger.http('Incoming request', data);
        } catch (e) {
          logger.http('Incoming request (parse error)', { raw: message });
        }
      },
    },
  }
);
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}
app.use(morganJson);

// ---- Mount routes (v3) ----
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/shop', shopRoutes);
app.use('/api/v1/flowers', flowerRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/staff', staffRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/health', healthRoutes);

// ---- 404 handler ----
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ---- Central error handler (kept simple; enhance as needed) ----
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  const payload = {
    error: err.message || 'Internal Server Error',
  };
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    payload.stack = err.stack;
  }
  logger.error('Unhandled error', { status, message: err.message, stack: err.stack });
  res.status(status).json(payload);
});

// ---- Start server once DB is ready ----
db.sequelize
  .authenticate()
  .then(() => {
    logger.info('✅ Database connection established');
    return db.sequelize.sync(); // consider { alter: true } in dev only
  })
  .then(() => {
    const port = config.port || process.env.PORT || 4000;
    app.listen(port, () => logger.info(`🚀 Server is running on port ${port}`));
  })
  .catch((err) => {
    logger.error('❌ Failed to start server (DB error):', err);
    process.exit(1);
  });

// ---- Graceful shutdown ----
process.on('SIGINT', async () => {
  try {
    await db.sequelize.close();
    logger.info('🔻 DB connection closed');
  } finally {
    process.exit(0);
  }
});