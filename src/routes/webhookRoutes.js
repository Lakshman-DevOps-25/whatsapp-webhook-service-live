const express = require('express');
const controller = require('../controllers/webhookController');
const logger = require('../utils/logger');
const router = express.Router();

router.get('/webhook', (req, res) => {
  logger.debug({ path: req.path, method: req.method }, 'Webhook route received verification request');
  controller.verify(req, res);
});
router.post('/webhook', (req, res, next) => {
  logger.debug({ path: req.path, method: req.method }, 'Webhook route received event');
  controller.receive(req, res).catch(next);
});
module.exports = router;
