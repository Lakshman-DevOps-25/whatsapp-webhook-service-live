const crypto = require('crypto');
const Message = require('../models/Message');
const WebhookEvent = require('../models/WebhookEvent');
const config = require('../config');
const logger = require('../utils/logger');
const whatsapp = require('./whatsappService');
const azure = require('./azureStorageService');
const messages = require('./messageService');

const mediaTypes = new Set(['image', 'video', 'audio', 'document', 'sticker']);

async function processMedia(record, source) {
  const mediaId = source?.id;
  if (!mediaId) {
    await messages.updateMedia(record.waMessageId, { status: 'failed', failureReason: 'Media ID missing', attempts: 0 });
    logger.error({ messageId: record.waMessageId, type: record.messageType, direction: record.direction }, 'Media payload has no media ID');
    return;
  }
  const current = await Message.findOne({ waMessageId: record.waMessageId }).lean();
  if (current?.media?.status === 'uploaded') return;
  await messages.updateMedia(record.waMessageId, { status: 'pending', attempts: 0 });
  for (let attempt = 1; attempt <= config.media.maxAttempts; attempt += 1) {
    try {
      logger.debug({ messageId: record.waMessageId, type: record.messageType, direction: record.direction, attempt }, 'Starting media retrieval attempt');
      const metadata = await whatsapp.resolveMedia(mediaId);
      const download = await whatsapp.downloadMedia(metadata.url);
      const mimeType = metadata.mime_type || source.mime_type || download.headers['content-type'] || 'application/octet-stream';
      const filename = source.filename || (record.messageType === 'document' ? 'document' : `${mediaId}.${mimeType.split('/')[1] || 'bin'}`);
      const uploaded = await azure.upload({ messageId: record.waMessageId, buffer: Buffer.from(download.data), mimeType, filename });
      await messages.updateMedia(record.waMessageId, {
        status: 'uploaded', ...uploaded, originalFilename: source.filename || undefined, attempts: attempt
      });
      logger.info({ messageId: record.waMessageId, type: record.messageType, direction: record.direction, attempt, size: uploaded.size }, 'Media stored successfully');
      return;
    } catch (error) {
      const reason = error.response?.status ? `HTTP ${error.response.status}: ${error.message}` : error.message;
      logger.warn({ messageId: record.waMessageId, type: record.messageType, direction: record.direction, attempt, maxAttempts: config.media.maxAttempts, error: reason }, 'Media retrieval/upload failed');
      if (attempt < config.media.maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, config.media.retryBaseMs * (2 ** (attempt - 1))));
      } else {
        await messages.updateMedia(record.waMessageId, { status: 'failed', failureReason: reason, attempts: attempt, mimeType: source.mime_type, originalFilename: source.filename });
        logger.error({ messageId: record.waMessageId, type: record.messageType, direction: record.direction, attempts: attempt, error: reason }, 'Media marked failed after retries');
      }
    }
  }
}

async function processPayload(payload) {
  const entries = payload.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      for (const item of value.messages || []) {
        const sender = item.from || null;
        const recipient = value.metadata?.display_phone_number || value.metadata?.phone_number_id || null;
        const type = item.type || 'unknown';
        const record = {
          waMessageId: item.id,
          direction: 'inbound', sender, recipient,
          timestamp: item.timestamp ? new Date(Number(item.timestamp) * 1000) : new Date(),
          messageType: type,
          textBody: type === 'text' ? item.text?.body ?? null : null,
          rawPayload: item
        };
        logger.debug({ messageId: item.id, type, direction: 'inbound', sender, recipient }, 'Classified inbound WhatsApp message');
        await messages.persistMessage(record);
        if (mediaTypes.has(type)) await processMedia(record, item[type]);
      }
      for (const status of value.statuses || []) {
        logger.debug({ messageId: status.id, status: status.status, direction: 'outbound' }, 'Classified outbound status event');
        await messages.appendStatus({
          id: status.id, status: status.status, timestamp: status.timestamp,
          recipientId: status.recipient_id, errors: status.errors, rawPayload: status
        });
      }
    }
  }
}

exports.processEvent = async (eventId) => {
  const now = new Date();
  const event = await WebhookEvent.findOneAndUpdate(
    { _id: eventId, processedAt: null, $or: [{ claimUntil: null }, { claimUntil: { $lt: now } }] },
    { $set: { claimUntil: new Date(now.getTime() + 10 * 60 * 1000) }, $inc: { attempts: 1 } },
    { new: true }
  );
  if (!event) return;
  try {
    await processPayload(event.payload);
    await WebhookEvent.updateOne({ _id: event._id }, { $set: { processedAt: new Date(), lastError: null, claimUntil: null } });
    logger.debug({ eventKey: event.eventKey, attempts: event.attempts }, 'Webhook inbox event processed');
  } catch (error) {
    await WebhookEvent.updateOne({ _id: event._id }, { $set: { lastError: error.message, claimUntil: null } });
    logger.error({ eventKey: event.eventKey, attempts: event.attempts, error: error.message }, 'Webhook event processing failed; retained for retry');
  }
};

exports.enqueuePayload = async (payload, rawBody) => {
  const eventKey = crypto.createHash('sha256').update(rawBody).digest('hex');
  let event;
  try {
    event = await WebhookEvent.findOneAndUpdate(
      { eventKey }, { $setOnInsert: { eventKey, payload } }, { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    event = await WebhookEvent.findOne({ eventKey });
  }
  logger.debug({ eventKey, duplicate: Boolean(event.processedAt) }, 'Webhook payload persisted to inbox');
  return event;
};

exports.processPending = async () => {
  const events = await WebhookEvent.find({ processedAt: null }).sort({ createdAt: 1 }).limit(100).select('_id').lean();
  for (const event of events) await exports.processEvent(event._id);
};

exports.processMedia = processMedia;
