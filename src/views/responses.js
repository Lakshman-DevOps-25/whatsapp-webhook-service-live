const logger = require('../utils/logger');

exports.ok = (res, data, status = 200) => {
  logger.debug({ status }, 'Formatting successful API response');
  return res.status(status).json({ success: true, data });
};

exports.error = (res, status, message) => {
  logger.debug({ status }, 'Formatting API error response');
  return res.status(status).json({ success: false, error: message });
};
