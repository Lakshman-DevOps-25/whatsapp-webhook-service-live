const crypto = require('crypto');
const WebhookEvent = require('../models/WebhookEvent');
const logger = require('../utils/logger');
const messages = require('./messageService');

const mediaTypes = new Set(['image', 'video', 'audio', 'document', 'sticker']);

async function processMedia(record, source) {
  const mediaId = source?.id;
  if (!mediaId) {
    await messages.updateMedia(record.waMessageId, { status: 'failed', failureReason: 'Media ID missing', attempts: 0 });
    logger.error({ messageId: record.waMessageId, type: record.messageType, direction: record.direction }, 'Media payload has no media ID');
    return;
  }
  // Azure is temporarily disabled; keep the media reference and available metadata in MongoDB.
  const metadata = {
    status: 'metadata_only', mediaId,
    mimeType: source.mime_type,
    size: source.file_size,
    originalFilename: source.filename,
    failureReason: 'Binary storage disabled while Azure Blob Storage is unavailable',
    attempts: 0
  };
  await messages.updateMedia(record.waMessageId, metadata);
  logger.info({ messageId: record.waMessageId, type: record.messageType, direction: record.direction, mediaId }, 'Media reference stored in MongoDB; binary storage is disabled');
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
          recipientId: status.recipient_id, errorDetails: status.errors, rawPayload: status
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
