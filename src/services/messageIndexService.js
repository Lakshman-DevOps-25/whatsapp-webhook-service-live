const Message = require('../models/Message');
const logger = require('../utils/logger');

const indexName = 'waMessageId_unique';

exports.ensureUniqueWhatsAppMessageId = async () => {
  let indexes = [];
  try {
    indexes = await Message.collection.indexes();
  } catch (error) {
    if (error.code !== 26 && error.codeName !== 'NamespaceNotFound') throw error;
  }

  const messageIdIndexes = indexes.filter(index =>
    Object.keys(index.key || {}).length === 1 && index.key.waMessageId === 1
  );
  const desiredIndex = messageIdIndexes.find(index => index.name === indexName && index.unique);
  const staleIndexes = messageIdIndexes.filter(index => index.name !== indexName || !index.unique);

  if (desiredIndex && staleIndexes.length === 0) {
    logger.debug({ index: indexName }, 'Unique WhatsApp message ID index already exists');
    return;
  }

  if (staleIndexes.length > 0) {
    const duplicates = await Message.aggregate([
      { $group: { _id: '$waMessageId', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 5 }
    ]);
    if (duplicates.length) {
      logger.error({ sampleDuplicateGroups: duplicates.length }, 'Cannot migrate WhatsApp message ID index while duplicate records exist');
      throw new Error('MongoDB contains duplicate waMessageId values. Deduplicate those records before restarting so the unique idempotency index can be created.');
    }
    for (const index of staleIndexes) {
      logger.debug({ index: index.name, unique: Boolean(index.unique) }, 'Removing legacy WhatsApp message ID index before migration');
      await Message.collection.dropIndex(index.name);
    }
  }

  await Message.collection.createIndex({ waMessageId: 1 }, { unique: true, name: indexName });
  logger.info({ index: indexName }, 'Unique WhatsApp message ID index is ready');
};
