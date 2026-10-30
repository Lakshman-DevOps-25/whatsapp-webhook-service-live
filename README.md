# WhatsApp webhook service

Node.js MVC service for WhatsApp Cloud API webhooks and MongoDB message/audit records. Azure Blob Storage calls are currently disabled.

## Setup

1. Install Node.js 20+, MongoDB, and dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set all listed credentials. Azure credentials are not required while Azure storage is disabled.
3. Start with `npm start` (or `npm run dev`). Configure Meta's app webhook callback URL as `https://<public-host>/webhook` and use the exact `WHATSAPP_VERIFY_TOKEN` value for Meta's verification token. Subscribe the app to the WhatsApp Business Account `messages` webhook field.
4. Set `WHATSAPP_APP_SECRET` to the Meta app secret. All POST webhook deliveries are checked against `X-Hub-Signature-256` before they are accepted.

`POST /api/messages` sends a text or supported media message through the configured phone number ID and persists it as an outbound message. For media, send JSON `{ "to": "...", "type": "image|video|audio|document", "mediaUrl": "https://...", "caption": "...", "filename": "..." }`. For text, send `{ "to": "...", "type": "text", "text": "..." }`.

Messages, status events, raw webhook payloads, and available media metadata are stored in MongoDB. Azure Blob Storage calls and media binary downloads are disabled. Media records retain the Meta media ID, MIME type, and filename/size when provided, and use `metadata_only` status to show that the binary was not archived. A webhook inbox is persisted before returning 200 and replayed after process restart.

At startup, the service migrates a legacy non-unique `waMessageId` index to the unique index required for idempotency. Duplicate message documents are merged (keeping the richest message/media data and deduplicating status entries); removed duplicates are preserved in the `message_duplicate_archive` collection before deletion. Legacy records with no WhatsApp message ID are preserved in `message_orphan_archive` and removed from the active messages collection, since they cannot be keyed idempotently.

The Meta webhook supplies inbound messages and status updates, but not the complete outbound message body. To capture full outbound records, send messages through this service (or integrate the exported `sendMessage` service in your sender).
