# WhatsApp CTA Message Templates - Curl Examples

This file shows how to use the CTA message API with curl commands. All messages use the `/api/messages/send` endpoint.

## 1. CTA Copy (OTP Copy Button)

Send a message with a copyable OTP code.

```bash
curl -X POST "http://localhost:3000/api/messages/send" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "session": "wa_123abc",
    "to": "918307418627",
    "type": "cta_copy",
    "message": {
      "header": "Verification",
      "text": "Your verification code is below. Tap to copy.",
      "footer": "Valid for 10 minutes",
      "button": {
        "text": "Copy Code",
        "code": "482910"
      }
    }
  }'
```

### Request Body Structure:

```json
{
  "session": "{{SESSION_ID}}",
  "to": "{{PHONE_NUMBER}}",
  "type": "cta_copy",
  "message": {
    "header": "{{HEADER_TEXT}}",
    "text": "{{BODY_TEXT}}",
    "footer": "{{FOOTER_TEXT}}",
    "button": {
      "text": "{{BUTTON_TEXT}}",
      "code": "{{COPY_CODE}}"
    }
  }
}
```

## 2. CTA Call (Phone Call Button)

Send a message with a call button.

```bash
curl -X POST "http://localhost:3000/api/messages/send" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "session": "wa_123abc",
    "to": "918307418627",
    "type": "cta_call",
    "message": {
      "header": "Contact Support",
      "text": "Need help? Our support team is ready to assist you.",
      "footer": "Available 24/7",
      "button": {
        "text": "Call Now",
        "phone": "919876543210"
      }
    }
  }'
```

### Request Body Structure:

```json
{
  "session": "{{SESSION_ID}}",
  "to": "{{PHONE_NUMBER}}",
  "type": "cta_call",
  "message": {
    "header": "{{HEADER_TEXT}}",
    "text": "{{BODY_TEXT}}",
    "footer": "{{FOOTER_TEXT}}",
    "button": {
      "text": "{{BUTTON_TEXT}}",
      "phone": "{{PHONE_CALL_NUMBER}}"
    }
  }
}
```

## 3. CTA URL (Website Link Button)

Send a message with a link button.

```bash
curl -X POST "http://localhost:3000/api/messages/send" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "session": "wa_123abc",
    "to": "918307418627",
    "type": "cta_url",
    "message": {
      "header": "Special Offer",
      "text": "Check out our exclusive deals and promotions.",
      "footer": "Limited time offer",
      "button": {
        "text": "Visit Website",
        "url": "https://example.com/offers"
      }
    }
  }'
```

### Request Body Structure:

```json
{
  "session": "{{SESSION_ID}}",
  "to": "{{PHONE_NUMBER}}",
  "type": "cta_url",
  "message": {
    "header": "{{HEADER_TEXT}}",
    "text": "{{BODY_TEXT}}",
    "footer": "{{FOOTER_TEXT}}",
    "button": {
      "text": "{{BUTTON_TEXT}}",
      "url": "{{BUTTON_URL}}"
    }
  }
}
```

## Using with Templates

Save templates for easy reuse:

```bash
curl -X POST "http://localhost:3000/api/messages/templates" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OTP Verification",
    "type": "cta_copy",
    "data": {
      "header": "Verification",
      "body": "Your verification code is below. Tap to copy.",
      "footer": "Valid for 10 minutes",
      "buttons": [{
        "name": "cta_copy",
        "buttonParamsJson": "{\"display_text\":\"Copy Code\",\"copy_code\":\"\"}"
      }]
    }
  }'
```

## Template Variables

All fields support template variables using `{{VARIABLE_NAME}}` syntax:

- `{{SESSION_ID}}` - WhatsApp session identifier
- `{{PHONE_NUMBER}}` - Recipient phone number (with country code, no +)
- `{{HEADER_TEXT}}` - Message header
- `{{BODY_TEXT}}` - Main message text
- `{{FOOTER_TEXT}}` - Message footer
- `{{BUTTON_TEXT}}` - Button label
- `{{COPY_CODE}}` - OTP code to copy
- `{{PHONE_CALL_NUMBER}}` - Phone number for call button
- `{{BUTTON_URL}}` - URL for link button

## Response Format

All successful requests return:

```json
{
  "success": true,
  "type": "cta_copy|cta_call|cta_url",
  "messageId": "msg_123abc"
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error message"
}
```

## Notes

- Phone numbers should be in international format without + prefix (e.g., `918307418627`)
- Headers, footers, and some fields are optional (can be omitted or empty string)
- All messages are sent as "view once" - they can only be viewed once and then disappear
- Button text should be concise (max 20 characters recommended)
