const mongoose = require('mongoose');
const logger = require('../utils/logger');

const schema = new mongoose.Schema({
  eventKey: { type: String, unique: true, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  processedAt: { type: Date, default: null },
  claimUntil: { type: Date, default: null },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: null }
}, { timestamps: true });

schema.pre('save', function logSave(next) {
  logger.debug({ eventKey: this.eventKey, attempts: this.attempts }, 'Saving webhook inbox event');
  next();
});

module.exports = mongoose.model('WebhookEvent', schema);
