const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../utils/logger');

exports.connect = async () => {
  logger.debug('Connecting to MongoDB');
  await mongoose.connect(config.mongoUri);
  logger.info('MongoDB connected');
};

exports.disconnect = () => mongoose.disconnect();
