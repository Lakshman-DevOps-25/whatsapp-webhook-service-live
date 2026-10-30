const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const WebhookEvent = require('../models/WebhookEvent');
const processor = require('../services/webhookProcessor');

exports.verify = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  logger.debug({ mode, tokenMatched: token === config.whatsapp.verifyToken }, 'Received webhook verification request');
  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) return res.status(200).send(challenge);
  return res.sendStatus(403);
};

exports.receive = async (req, res) => {
  const signature = req.get('x-hub-signature-256') || '';
  const expected = `sha256=${crypto.createHmac('sha256', config.whatsapp.appSecret).update(req.rawBody || Buffer.alloc(0)).digest('hex')}`;
  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  const valid = suppliedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
  logger.debug({ valid, bytes: req.rawBody?.length || 0 }, 'Webhook signature verification completed');
  if (!valid) return res.status(401).send('Invalid signature');

  try {
    const event = await processor.enqueuePayload(req.body, req.rawBody);
    res.sendStatus(200);
    if (!event.processedAt) setImmediate(() => processor.processEvent(event._id));
  } catch (error) {
    logger.error({ error: error.message }, 'Could not persist signed webhook event');
    res.sendStatus(503);
  }
};
