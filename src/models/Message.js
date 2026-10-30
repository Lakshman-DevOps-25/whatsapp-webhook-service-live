const mongoose = require('mongoose');
const logger = require('../utils/logger');

const mediaSchema = new mongoose.Schema({
  status: { type: String, enum: ['pending', 'uploaded', 'failed'], default: 'pending' },
  container: String,
  blobName: String,
  url: String,
  mimeType: String,
  size: Number,
  originalFilename: String,
  failureReason: String,
  attempts: { type: Number, default: 0 }
}, { _id: false });

const messageSchema = new mongoose.Schema({
  waMessageId: { type: String, required: true, unique: true, index: true },
  direction: { type: String, enum: ['inbound', 'outbound', 'unknown'], required: true },
  sender: { type: String, default: null },
  recipient: { type: String, default: null },
  timestamp: { type: Date, default: Date.now },
  messageType: { type: String, required: true },
  textBody: { type: String, default: null },
  rawPayload: { type: mongoose.Schema.Types.Mixed, required: true },
  media: { type: mediaSchema, default: undefined },
  statuses: [{ status: String, timestamp: Date, recipientId: String, errors: mongoose.Schema.Types.Mixed, rawPayload: mongoose.Schema.Types.Mixed }]
}, { timestamps: true, minimize: false });

messageSchema.pre('save', function logSave(next) {
  logger.debug({ messageId: this.waMessageId, type: this.messageType, direction: this.direction }, 'Saving message model');
  next();
});

module.exports = mongoose.model('Message', messageSchema);
