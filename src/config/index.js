require('dotenv').config();
const logger = require('../utils/logger');

const required = [
  'MONGODB_URI', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_API_VERSION', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN',
  'AZURE_STORAGE_CONNECTION_STRING', 'AZURE_STORAGE_CONTAINER'
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

const config = Object.freeze({
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  mongoUri: process.env.MONGODB_URI,
  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: process.env.WHATSAPP_API_VERSION,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN
  },
  azure: {
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
    container: process.env.AZURE_STORAGE_CONTAINER
  },
  media: {
    maxAttempts: Math.max(1, Number(process.env.MEDIA_DOWNLOAD_MAX_ATTEMPTS || 3)),
    retryBaseMs: Math.max(100, Number(process.env.MEDIA_DOWNLOAD_RETRY_BASE_MS || 1000))
  }
});

logger.debug({ port: config.port, nodeEnv: config.nodeEnv, logLevel: config.logLevel }, 'Configuration loaded');
module.exports = config;
