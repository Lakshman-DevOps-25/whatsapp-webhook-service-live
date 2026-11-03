const config = require('../config');
const logger = require('../utils/logger');
const responses = require('../views/responses');
const whatsapp = require('../services/whatsappService');
const messages = require('../services/messageService');

exports.send = async (req, res) => {
  const { to, type = 'text' } = req.body;
  if (!to || !['text', 'image', 'video', 'audio', 'document', 'sticker'].includes(type)) return responses.error(res, 400, 'A recipient and supported message type are required');
  let payload;
  if (type === 'text') {
    if (typeof req.body.text !== 'string') return responses.error(res, 400, 'text is required for a text message');
    payload = { to, type, text: { preview_url: false, body: req.body.text } };
  } else {
    if (!req.body.mediaUrl) return responses.error(res, 400, 'mediaUrl is required for a media message');
    try {
      const mediaUrl = new URL(req.body.mediaUrl);
      if (mediaUrl.protocol !== 'https:') return responses.error(res, 400, 'mediaUrl must use HTTPS');
    } catch {
      return responses.error(res, 400, 'mediaUrl must be a valid HTTPS URL');
    }
    const media = { link: req.body.mediaUrl };
    if (req.body.caption && ['image', 'video', 'document'].includes(type)) media.caption = req.body.caption;
    if (type === 'document' && req.body.filename) media.filename = req.body.filename;
    payload = { to, type, [type]: media };
  }
  let result;
  try {
    result = await whatsapp.sendMessage(payload);
  } catch (error) {
    const providerError = error.response?.data?.error;
    let message = providerError?.message || 'WhatsApp Cloud API request failed';
    if (config.whatsapp.accessToken) message = message.split(config.whatsapp.accessToken).join('[REDACTED]');
    logger.error({
      type, direction: 'outbound', recipient: to,
      upstreamStatus: error.response?.status,
      providerCode: providerError?.code,
      providerSubcode: providerError?.error_subcode,
      fbtraceId: providerError?.fbtrace_id,
      error: message
    }, 'WhatsApp Cloud API rejected or failed the send request');
    return responses.error(res, 502, message);
  }

  const waMessageId = result.messages?.[0]?.id;
  if (!waMessageId) {
    logger.error({ type, direction: 'outbound', recipient: to }, 'WhatsApp accepted response did not contain a message ID');
    return responses.error(res, 502, 'WhatsApp API response did not include a message ID');
  }

  try {
    const mediaRecord = type === 'text' ? undefined : {
      status: 'metadata_only',
      originalFilename: req.body.filename,
      mimeType: req.body.mimeType,
      size: req.body.size,
      failureReason: 'Binary storage disabled while Azure Blob Storage is unavailable'
    };
    await messages.persistMessage({
      waMessageId, direction: 'outbound', sender: config.whatsapp.phoneNumberId, recipient: to,
      timestamp: new Date(), messageType: type, textBody: type === 'text' ? req.body.text : null,
      rawPayload: { request: payload, response: result },
      ...(mediaRecord ? { media: mediaRecord } : {})
    });
  } catch (error) {
    logger.error({ messageId: waMessageId, type, direction: 'outbound', recipient: to, error: error.message }, 'WhatsApp sent the message, but MongoDB persistence failed');
    return responses.error(res, 500, `WhatsApp sent message ${waMessageId}, but it could not be saved to MongoDB. Do not resend; check the database and application logs.`);
  }

  logger.info({ messageId: waMessageId, type, direction: 'outbound', recipient: to }, 'Outbound message sent and recorded');
  return responses.ok(res, { messageId: waMessageId, response: result }, 201);
};
