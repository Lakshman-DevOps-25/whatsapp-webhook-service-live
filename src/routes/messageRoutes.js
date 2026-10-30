const express = require('express');
const controller = require('../controllers/messageController');
const logger = require('../utils/logger');
const router = express.Router();

router.post('/messages', (req, res, next) => {
  logger.debug({ path: req.path, method: req.method, type: req.body?.type || 'text' }, 'Message route received send request');
  controller.send(req, res, next);
});
module.exports = router;
