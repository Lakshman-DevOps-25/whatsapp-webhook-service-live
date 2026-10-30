/* TEMPORARILY DISABLED while Azure Blob Storage is unavailable.
 * Runtime code does not import this service. Inbound media references and
 * outbound message metadata are persisted in MongoDB without binary uploads.
 * Remove this block and restore the configuration/dependency to re-enable it.
 */
/*
const { BlobServiceClient } = require('@azure/storage-blob');
const config = require('../config');
const logger = require('../utils/logger');

const serviceClient = BlobServiceClient.fromConnectionString(config.azure.connectionString);
const containerClient = serviceClient.getContainerClient(config.azure.container);

exports.ensureContainer = async () => {
  logger.debug({ container: config.azure.container }, 'Ensuring Azure media container exists');
  await containerClient.createIfNotExists();
};

exports.upload = async ({ messageId, buffer, mimeType, filename }) => {
  const safeName = (filename || 'media').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const blobName = `${new Date().toISOString().slice(0, 10)}/${messageId}/${safeName}`;
  logger.debug({ messageId, blobName, size: buffer.length, mimeType }, 'Uploading media to Azure Blob Storage');
  const blob = containerClient.getBlockBlobClient(blobName);
  await blob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: mimeType || 'application/octet-stream' } });
  return { container: config.azure.container, blobName, url: blob.url, size: buffer.length, mimeType };
};
*/
