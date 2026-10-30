const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const database = require('./services/databaseService');
const processor = require('./services/webhookProcessor');
const azure = require('./services/azureStorageService');
const Message = require('./models/Message');
const WebhookEvent = require('./models/WebhookEvent');
const messageIndexes = require('./services/messageIndexService');

async function start() {
  logger.debug({ port: config.port }, 'Starting service initialization');
  await database.connect();
  await messageIndexes.ensureUniqueWhatsAppMessageId();
  await Promise.all([Message.init(), WebhookEvent.init()]);
  await azure.ensureContainer();
  const server = app.listen(config.port, () => logger.info({ port: config.port }, 'WhatsApp webhook service listening'));
  await processor.processPending();
  const retryTimer = setInterval(() => processor.processPending().catch(error => logger.error({ error: error.message }, 'Pending webhook replay failed')), 30000);
  retryTimer.unref();
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down service');
    clearInterval(retryTimer);
    server.close(async () => { await database.disconnect(); process.exit(0); });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch(error => {
  logger.fatal({ error: error.message }, 'Service startup failed');
  process.exit(1);
});
