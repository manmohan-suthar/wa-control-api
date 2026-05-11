# Interactive Messages Architecture

Universal system for sending all WhatsApp interactive message types through a single API endpoint.

## 📋 Overview

- **Single Endpoint**: `POST /api/messages/interactive`
- **Type-based Routing**: Dynamic handler selection based on message type
- **Modular Design**: Each message type in separate service file
- **Frontend-Friendly**: Common JSON format for all types

## 🏗️ Folder Structure

```
backend/
├── controllers/
│   └── interactiveController.js          # Main router & logic
├── routes/
│   └── interactiveRoutes.js              # Route definitions
└── services/
    ├── interactive/
    │   ├── buttonMapper.js               # Button utilities
    │   ├── interactiveConstants.js       # Types & limits
    │   ├── validation.js                 # Input validation
    │   ├── API_EXAMPLES.js               # Documentation
    │   ├── quickReply.js                 # ✅ Fully Stable
    │   ├── ctaUrl.js                     # ✅ Fully Stable
    │   ├── ctaCall.js                    # ✅ Fully Stable
    │   ├── listMessage.js                # ✅ Fully Stable
    │   ├── nativeFlow.js                 # ✅ Fully Stable
    │   ├── carousel.js                   # ⚠️ Semi Stable
    │   ├── webview.js                    # ⚠️ Semi Stable
    │   ├── payment.js                    # ⚠️ Semi Stable
    │   ├── product.js                    # ❌ Use Cloud API
    │   └── multiProduct.js               # ❌ Use Cloud API
    └── WhatsAppService.js                # Session management

frontend/
└── services/
    └── interactiveMessageService.js      # Frontend helper functions
```

## 🚀 Quick Start

### Backend Setup

1. **Register the route** in your main `server.js`:

```javascript
import interactiveRoutes from "./routes/interactiveRoutes.js";
app.use(interactiveRoutes);
```

2. **Send a message** from frontend:

```javascript
const response = await fetch("/api/messages/interactive", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sessionId: "wa_123",
    to: "918888888888",
    type: "quick_reply",
    data: {
      body: "Choose option",
      buttons: [
        { id: "btn1", text: "Option 1" },
        { id: "btn2", text: "Option 2" },
      ],
    },
  }),
});
```

### Frontend Integration

Use the provided helper functions:

```javascript
import {
  sendQuickReplyMessage,
  sendURLButtonMessage,
  sendCallButtonMessage,
} from "./services/interactiveMessageService.js";

// Send quick reply
await sendQuickReplyMessage("wa_123", "918888888888", "What do you need?", [
  "Pricing",
  "Support",
  "Demo",
]);

// Send URL button
await sendURLButtonMessage("wa_123", "918888888888", "Visit our site", [
  { text: "Click Here", url: "https://example.com" },
]);
```

## 📤 Supported Message Types

### ✅ Fully Stable (Production Ready)

| Type          | Use Case       | Max       | Status    |
| ------------- | -------------- | --------- | --------- |
| `quick_reply` | Simple buttons | 10        | ✅ Stable |
| `cta_url`     | Website links  | 10        | ✅ Stable |
| `cta_call`    | Phone calls    | 10        | ✅ Stable |
| `list`        | Large menus    | Unlimited | ✅ Stable |
| `native_flow` | Complex flows  | 10        | ✅ Stable |

### ⚠️ Semi Stable (May Have Issues)

| Type       | Use Case         | Status         |
| ---------- | ---------------- | -------------- |
| `carousel` | Product showcase | ⚠️ Semi-stable |
| `webview`  | Custom UI        | ⚠️ Semi-stable |
| `payment`  | Payment links    | ⚠️ Semi-stable |

### ❌ Not Supported (Use Cloud API)

| Type            | Reason                                       |
| --------------- | -------------------------------------------- |
| `product`       | Requires Business catalog + Commerce Manager |
| `multi_product` | Requires official Cloud API                  |

## 📝 API Request Format

### Universal Format

```json
{
  "sessionId": "wa_1234567890",
  "to": "918888888888",
  "type": "TYPE_NAME",
  "data": {
    ...type-specific fields...
  }
}
```

### Quick Reply Example

```json
{
  "sessionId": "wa_123",
  "to": "918888888888",
  "type": "quick_reply",
  "data": {
    "body": "Choose an option",
    "footer": "Select one",
    "buttons": [
      { "id": "btn1", "text": "Button 1" },
      { "id": "btn2", "text": "Button 2" }
    ]
  }
}
```

### CTA URL Example

```json
{
  "sessionId": "wa_123",
  "to": "918888888888",
  "type": "cta_url",
  "data": {
    "body": "Visit our website",
    "buttons": [{ "text": "Click Here", "url": "https://example.com" }]
  }
}
```

### List Message Example {poll}

```json
{
  "sessionId": "wa_123",
  "to": "918888888888",
  "type": "list",
  "data": {
    "body": "Choose service",
    "title": "Our Services",
    "buttonText": "View Options",
    "sections": [
      {
        "title": "Development",
        "rows": [
          { "id": "web", "title": "Web Development" },
          { "id": "mobile", "title": "Mobile App" }
        ]
      }
    ]
  }
}
```

## ✅ Response Format

### Success

```json
{
  "success": true,
  "message": "Interactive message sent successfully",
  "type": "quick_reply"
}
```

### Error

```json
{
  "success": false,
  "error": "WhatsApp session not found"
}
```

## 🛠️ Validation & Constraints

### Message Limits

```
MAX_BUTTONS: 10
MAX_CAROUSEL_CARDS: 10
MAX_LIST_SECTIONS: 10
MAX_LIST_ROWS_PER_SECTION: 50
MAX_BODY_LENGTH: 1024
MAX_FOOTER_LENGTH: 60
MAX_BUTTON_TEXT_LENGTH: 20
MAX_TITLE_LENGTH: 128
```

### Input Validation

All inputs are validated in the controller:

- Session exists
- Recipient is valid phone
- Type is supported
- Data format is correct
- Button counts within limits
- Text lengths within limits

## 🔄 Type Routing System

The controller uses a simple mapping:

```javascript
const typeHandlers = {
  quick_reply: sendQuickReply,
  cta_url: sendCTAUrl,
  cta_call: sendCTACall,
  list: sendListMessage,
  native_flow: sendNativeFlow,
  carousel: sendCarousel,
  webview: sendWebView,
  payment: sendPayment,
  product: sendProduct,
  multi_product: sendMultiProduct,
};
```

When a request arrives, it selects the appropriate handler and executes it.

## 📚 Best Practices

### 1. Button Text

- Max 20 characters
- Use emojis for visual appeal
- Clear action-oriented text

**Good:**

```
"💰 Pricing", "🆘 Support", "📚 Docs"
```

**Bad:**

```
"Click here for detailed pricing information",
"Please contact support team for any questions"
```

### 2. Body Text

- Keep concise (max 1024 chars)
- Use emojis for highlighting
- Clear message intent

### 3. Button Count

- Quick reply: 3-4 buttons (optimal)
- CTA: 1-2 buttons
- List: Unlimited rows
- Max 10 buttons per message

### 4. Phone Number Format

Any of these formats work:

```
918888888888          (10-13 digits)
+918888888888         (with +)
+91 88888 88888       (with spaces)
```

### 5. Error Handling

Always handle errors gracefully:

```javascript
try {
  const result = await sendInteractiveMessage(config);
  console.log("Success:", result);
} catch (error) {
  console.error("Failed:", error.message);
  // Show user-friendly error message
}
```

## 🔌 Adding New Message Types

1. **Create service file** in `services/interactive/`:

```javascript
export async function sendNewType(sock, to, data) {
  try {
    // Your implementation
    await sock.sendMessage(jid, {...});
  } catch (error) {
    throw new Error(`New Type failed: ${error.message}`);
  }
}
```

2. **Import in controller**:

```javascript
import { sendNewType } from "../services/interactive/newType.js";
```

3. **Add to typeHandlers**:

```javascript
const typeHandlers = {
  // ... existing
  new_type: sendNewType,
};
```

4. **Add to SUPPORTED_TYPES array**:

```javascript
const SUPPORTED_TYPES = [
  // ... existing
  "new_type",
];
```

## 🚨 Known Limitations

### Baileys Library Limitations

- **Product Catalog**: Not supported (requires official Meta setup)
- **Multi-Product**: Unstable, use Cloud API
- **Carousel**: Occasional rendering issues on some devices
- **WebView**: Limited platform support

### Solution

For advanced features requiring official support:

1. Use Meta Cloud API directly
2. Get WhatsApp Business verification
3. Set up Commerce Manager (for products)
4. Maintain both solutions in parallel if needed

## 📊 Monitoring & Debugging

### Enable Logging

Each service includes error messages with context:

```javascript
console.error(`Error in sendInteractiveMessage (${req.body?.type}):`, err);
```

### Check Supported Types

```bash
curl http://localhost:3000/api/messages/interactive/types
```

Response:

```json
{
  "success": true,
  "data": {
    "fullyStable": ["quick_reply", "cta_url", ...],
    "semiStable": ["carousel", "webview", ...],
    "notSupported": ["product", "multi_product"],
    "supported": [...all types...]
  }
}
```

## 📖 File Documentation

- `API_EXAMPLES.js` - Complete request/response examples
- `interactiveConstants.js` - Types, limits, use cases
- `validation.js` - Input validation utilities
- `buttonMapper.js` - Button formatting utilities
- `interactiveMessageService.js` - Frontend helpers

## 🔐 Security Considerations

1. **Session Validation**: Always verify sessionId exists
2. **Rate Limiting**: Implement rate limits on the endpoint
3. **Input Sanitization**: Validation handles malformed input
4. **Phone Validation**: Prevents invalid phone numbers
5. **URL Validation**: Checks URL format before sending

## 🎯 Next Steps

1. Register routes in main server file
2. Test with all message types
3. Integrate frontend helpers
4. Set up logging/monitoring
5. Deploy to production

---

**Last Updated**: May 2026
**Version**: 1.0.0
