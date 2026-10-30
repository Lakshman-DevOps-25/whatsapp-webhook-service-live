# WhatsApp webhook service

Node.js MVC service for WhatsApp Cloud API webhooks, MongoDB message/audit records, and Azure Blob media storage.

## Setup

1. Install Node.js 20+, MongoDB, and dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set all credentials. Configure an Azure Storage connection string and a private container name. The service creates the container when needed.
3. Start with `npm start` (or `npm run dev`). Configure Meta's app webhook callback URL as `https://<public-host>/webhook` and use the exact `WHATSAPP_VERIFY_TOKEN` value for Meta's verification token. Subscribe the app to the WhatsApp Business Account `messages` webhook field.
4. Set `WHATSAPP_APP_SECRET` to the Meta app secret. All POST webhook deliveries are checked against `X-Hub-Signature-256` before they are accepted.

`POST /api/messages` sends a text or supported media message through the configured phone number ID and persists it as an outbound message. For media, send JSON `{ "to": "...", "type": "image|video|audio|document", "mediaUrl": "https://...", "caption": "...", "filename": "..." }`. For text, send `{ "to": "...", "type": "text", "text": "..." }`.

Messages and media metadata are stored in MongoDB; binary content is stored only in Azure. A webhook inbox is persisted before returning 200 and replayed after process restart. Inbound media processing retries transient failures, and its final processing state/error is retained on the parent message. Outbound media upload-by-URL uses Meta's Cloud API; inbound media is resolved from Meta then downloaded with authorization.

At startup, the service migrates a legacy non-unique `waMessageId` index to the unique index required for idempotency. Duplicate message documents are merged (keeping the richest message/media data and deduplicating status entries); removed duplicates are preserved in the `message_duplicate_archive` collection before deletion. Records with no WhatsApp message ID are not merged and will stop startup for manual repair.

The Meta webhook supplies inbound messages and status updates, but not the complete outbound message body. To capture full outbound records, send messages through this service (or integrate the exported `sendMessage` service in your sender).
