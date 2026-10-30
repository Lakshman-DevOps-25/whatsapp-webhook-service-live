const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const apiRoot = `https://graph.facebook.com/${config.whatsapp.apiVersion}`;
const headers = { Authorization: `Bearer ${config.whatsapp.accessToken}` };

exports.resolveMedia = async (mediaId) => {
  logger.debug({ mediaId }, 'Resolving WhatsApp media metadata');
  const { data } = await axios.get(`${apiRoot}/${encodeURIComponent(mediaId)}`, { headers, timeout: 20000 });
  return data;
};

exports.sendMessage = async (payload) => {
  logger.debug({ type: payload.type, recipient: payload.to }, 'Sending WhatsApp message');
  const { data } = await axios.post(`${apiRoot}/${config.whatsapp.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', recipient_type: 'individual', ...payload
  }, { headers: { ...headers, 'Content-Type': 'application/json' }, timeout: 30000 });
  logger.debug({ messageId: data.messages?.[0]?.id, type: payload.type, direction: 'outbound' }, 'WhatsApp send accepted');
  return data;
};
