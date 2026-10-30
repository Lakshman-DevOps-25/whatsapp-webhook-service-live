const Message = require('../models/Message');
const logger = require('../utils/logger');

exports.persistMessage = async (record) => {
  const { waMessageId, messageType, direction } = record;
  logger.debug({ messageId: waMessageId, type: messageType, direction }, 'Upserting message in MongoDB');
  try {
    const placeholder = await Message.findOneAndUpdate(
      { waMessageId, messageType: 'unknown' }, { $set: record }, { new: true }
    );
    if (placeholder) return placeholder;
    return await Message.findOneAndUpdate(
      { waMessageId }, { $setOnInsert: record }, { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    logger.debug({ messageId: waMessageId, type: messageType, direction }, 'Concurrent duplicate message insert resolved');
    return Message.findOne({ waMessageId });
  }
};

exports.appendStatus = async ({ id, status, timestamp, recipientId, errorDetails, rawPayload }) => {
  logger.debug({ messageId: id, status, direction: 'outbound' }, 'Persisting WhatsApp status event');
  await Message.findOneAndUpdate(
    { waMessageId: id },
    {
      $setOnInsert: { waMessageId: id, direction: 'outbound', messageType: 'unknown', timestamp: new Date(), rawPayload },
      $push: { statuses: { status, timestamp: timestamp ? new Date(Number(timestamp) * 1000) : new Date(), recipientId, errorDetails, rawPayload } }
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
};

exports.updateMedia = async (id, media) => {
  logger.debug({ messageId: id, type: 'media', direction: 'inbound', status: media.status }, 'Updating media state in MongoDB');
  await Message.updateOne({ waMessageId: id }, { $set: { media } });
};

exports.getById = async (id) => Message.findOne({ waMessageId: id });
