const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const responses = require('../views/responses');
const whatsapp = require('../services/whatsappService');
const messages = require('../services/messageService');
const azure = require('../services/azureStorageService');

exports.send = async (req, res, next) => {
  const { to, type = 'text' } = req.body;
  if (!to || !['text', 'image', 'video', 'audio', 'document', 'sticker'].includes(type)) return responses.error(res, 400, 'A recipient and supported message type are required');
  let payload;
  let outboundBlob;
  if (type === 'text') {
    if (typeof req.body.text !== 'string') return responses.error(res, 400, 'text is required for a text message');
    payload = { to, type, text: { preview_url: false, body: req.body.text } };
  } else {
    if (!req.body.mediaUrl) return responses.error(res, 400, 'mediaUrl is required for a media message');
    try {
      const mediaUrl = new URL(req.body.mediaUrl);
      if (mediaUrl.protocol !== 'https:') return responses.error(res, 400, 'mediaUrl must use HTTPS');
      logger.debug({ type, direction: 'outbound', urlHost: mediaUrl.host }, 'Retrieving outbound media for archival');
      const downloaded = await axios.get(mediaUrl.href, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 100 * 1024 * 1024 });
      const mimeType = req.body.mimeType || downloaded.headers['content-type'] || 'application/octet-stream';
      outboundBlob = await azure.upload({
        messageId: `outbound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        buffer: Buffer.from(downloaded.data), mimeType, filename: req.body.filename || 'outbound-media'
      });
    } catch (error) {
      logger.error({ type, direction: 'outbound', error: error.message }, 'Could not archive outbound media');
      return responses.error(res, 502, 'Could not retrieve and archive outbound media');
    }
    const media = { link: req.body.mediaUrl };
    if (req.body.caption && ['image', 'video', 'document'].includes(type)) media.caption = req.body.caption;
    if (type === 'document' && req.body.filename) media.filename = req.body.filename;
    payload = { to, type, [type]: media };
  }
  try {
    const result = await whatsapp.sendMessage(payload);
    const waMessageId = result.messages?.[0]?.id;
    if (waMessageId) {
      const mediaBody = type === 'text' ? null : req.body;
      await messages.persistMessage({
        waMessageId, direction: 'outbound', sender: config.whatsapp.phoneNumberId, recipient: to,
        timestamp: new Date(), messageType: type, textBody: type === 'text' ? req.body.text : null,
        rawPayload: { request: payload, response: result },
        ...(mediaBody ? { media: { status: 'uploaded', ...outboundBlob, originalFilename: req.body.filename, mimeType: outboundBlob.mimeType } } : {})
      });
    }
    logger.info({ messageId: waMessageId, type, direction: 'outbound', recipient: to }, 'Outbound message sent and recorded');
    return responses.ok(res, { messageId: waMessageId, response: result }, 201);
  } catch (error) {
    logger.error({ type, direction: 'outbound', recipient: to, error: error.message }, 'Outbound send failed');
    return next(error);
  }
};
