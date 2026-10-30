require('dotenv').config();
const pino = require('pino');

module.exports = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: ['req.headers.authorization', 'headers.authorization', 'config.headers.Authorization'],
    censor: '[REDACTED]'
  },
  base: { service: 'whatsapp-webhook' }
});
