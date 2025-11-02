const winston = require('winston');
const { combine, timestamp, json, colorize, printf } = winston.format;

const devFormat = printf(({ level, message, timestamp, ...meta }) => {
  return `${timestamp} [${level.toUpperCase()}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'http',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS A' }),
    process.env.NODE_ENV === 'development' ? colorize({ all: true }) : json(),
    process.env.NODE_ENV === 'development' ? devFormat : json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log', maxsize: 5_000_000, maxFiles: 3 })
  ]
});

module.exports = logger;