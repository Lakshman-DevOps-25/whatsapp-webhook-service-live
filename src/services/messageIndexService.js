const Message = require('../models/Message');
const logger = require('../utils/logger');

const indexName = 'waMessageId_unique';
const archive = Message.db.collection('message_duplicate_archive');

function recordScore(record) {
  return (record.messageType && record.messageType !== 'unknown' ? 100 : 0)
    + (record.textBody ? 20 : 0)
    + (record.sender ? 5 : 0)
    + (record.recipient ? 5 : 0)
    + (record.media?.status === 'uploaded' ? 50 : 0)
    + (record.media?.status === 'failed' ? 3 : 0)
    + (record.rawPayload ? 1 : 0);
}

function mergeRecords(records) {
  const sorted = [...records].sort((a, b) => recordScore(b) - recordScore(a));
  const primary = sorted[0];
  const statuses = new Map();
  for (const record of records) {
    for (const status of record.statuses || []) {
      const key = [status.status, status.timestamp?.toISOString?.() || status.timestamp, status.recipientId, JSON.stringify(status.rawPayload)].join('|');
      statuses.set(key, status);
    }
  }

  const media = records.map(record => record.media).filter(Boolean)
    .sort((a, b) => (b.status === 'uploaded') - (a.status === 'uploaded') || (b.attempts || 0) - (a.attempts || 0))[0];
  const timestamps = records.map(record => record.timestamp).filter(Boolean);
  const createdAt = records.map(record => record.createdAt).filter(Boolean).sort((a, b) => a - b)[0];
  const updatedAt = records.map(record => record.updatedAt).filter(Boolean).sort((a, b) => b - a)[0];

  return {
    ...primary,
    direction: primary.direction === 'unknown' ? sorted.find(record => record.direction !== 'unknown')?.direction || primary.direction : primary.direction,
    sender: sorted.find(record => record.sender)?.sender || null,
    recipient: sorted.find(record => record.recipient)?.recipient || null,
    textBody: sorted.find(record => record.textBody)?.textBody || null,
    timestamp: timestamps.sort((a, b) => a - b)[0] || primary.timestamp,
    media,
    statuses: [...statuses.values()],
    createdAt,
    updatedAt
  };
}

async function archiveAndMergeDuplicateMessages() {
  const duplicateGroups = await Message.aggregate([
    { $group: { _id: '$waMessageId', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { _id: 1 } }
  ]).allowDiskUse(true);

  if (duplicateGroups.length === 0) return;
  if (duplicateGroups.some(group => group._id == null)) {
    throw new Error('MongoDB contains multiple message records without waMessageId values. These cannot be safely merged; repair or remove the orphan records before restarting.');
  }
  logger.warn({ groups: duplicateGroups.length, archiveCollection: 'message_duplicate_archive' }, 'Merging duplicate WhatsApp message records');

  for (const group of duplicateGroups) {
    const records = await Message.find({ waMessageId: group._id }).sort({ createdAt: 1, _id: 1 }).lean();
    if (records.length < 2) continue;
    const merged = mergeRecords(records);
    const primaryId = merged._id;
    const duplicates = records.filter(record => !record._id.equals(primaryId));

    // Archive each removed document before merging and deleting it so data remains recoverable.
    for (const duplicate of duplicates) {
      await archive.updateOne(
        { _id: duplicate._id },
        { $setOnInsert: { duplicateOf: primaryId, waMessageId: group._id, archivedAt: new Date(), document: duplicate } },
        { upsert: true }
      );
    }

    const { _id, __v, ...fields } = merged;
    await Message.updateOne({ _id: primaryId }, { $set: fields, $unset: { __v: '' } });
    await Message.deleteMany({ waMessageId: group._id, _id: { $ne: primaryId } });
    logger.info({ messageId: group._id, mergedRecords: records.length, archivedRecords: duplicates.length }, 'Duplicate WhatsApp message records merged');
  }
}

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

  if (!desiredIndex) {
    await archiveAndMergeDuplicateMessages();
  }

  if (staleIndexes.length > 0) {
    for (const index of staleIndexes) {
      logger.debug({ index: index.name, unique: Boolean(index.unique) }, 'Removing legacy WhatsApp message ID index before migration');
      try {
        await Message.collection.dropIndex(index.name);
      } catch (error) {
        if (error.code !== 27 && error.codeName !== 'IndexNotFound') throw error;
      }
    }
  }

  await Message.collection.createIndex({ waMessageId: 1 }, { unique: true, name: indexName });
  logger.info({ index: indexName }, 'Unique WhatsApp message ID index is ready');
};
