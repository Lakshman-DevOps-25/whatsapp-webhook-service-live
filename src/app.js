const express = require('express');
const webhookRoutes = require('./routes/webhookRoutes');
const messageRoutes = require('./routes/messageRoutes');
const logger = require('./utils/logger');

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  logger.debug({ method: req.method, path: req.path }, 'Incoming HTTP request');
  next();
});
app.use(express.json({ limit: '2mb', verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
app.use(webhookRoutes);
app.use('/api', messageRoutes);
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.use((error, req, res, next) => {
  logger.error({ method: req.method, path: req.path, error: error.message }, 'Unhandled request error');
  if (res.headersSent) return next(error);
  return res.status(500).json({ success: false, error: 'Internal server error' });
});

module.exports = app;
