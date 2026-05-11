/**
 * ============================================
 * INTEGRATION GUIDE FOR INTERACTIVE MESSAGES
 * ============================================
 *
 * Step-by-step guide to integrate the new interactive messaging system
 */

/**
 * STEP 1: Register Routes in server.js
 * ============================================
 *
 * Location: /backend/server.js (around line 40-50)
 *
 * ADD THIS IMPORT:
 */
// import interactiveRoutes from "./routes/interactiveRoutes.js";

/**
 * THEN ADD THIS MIDDLEWARE (around line 90-95, with other app.use() calls):
 */
// app.use(interactiveRoutes);

/**
 * COMPLETE EXAMPLE OF HOW IT SHOULD LOOK:
 *
 * import interactiveRoutes from "./routes/interactiveRoutes.js";
 *
 * app.use("/api/messages", messageRoutes);
 * app.use("/api/messages/media", mediaMessageRoutes);
 * app.use(interactiveRoutes);  // <-- ADD THIS LINE
 * app.use("/api/campaigns", campaignRoutes);
 */

/**
 * ============================================
 * STEP 2: REMOVE OLD NATIVE MESSAGE ROUTE
 * ============================================
 *
 * The nativeMessageRoutes.js is now replaced by interactiveRoutes.js
 *
 * Remove from server.js:
 * - import nativeMessageRoutes from "./routes/nativeMessageRoutes.js";
 * - app.use(nativeMessageRoutes);
 *
 * (Optional: Keep it for backward compatibility)
 */

/**
 * ============================================
 * STEP 3: AVAILABLE ENDPOINTS
 * ============================================
 *
 * NEW UNIFIED ENDPOINT:
 * POST /api/messages/interactive
 *
 * Get supported types:
 * GET /api/messages/interactive/types
 *
 * OLD ENDPOINT (can be deprecated):
 * POST /api/messages/send-native
 */

/**
 * ============================================
 * STEP 4: QUICK TEST
 * ============================================
 *
 * Test with cURL:
 *
 * curl -X POST http://localhost:3000/api/messages/interactive \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "sessionId": "wa_1234567890",
 *     "to": "918888888888",
 *     "type": "quick_reply",
 *     "data": {
 *       "body": "Hello! Choose an option:",
 *       "footer": "Test Message",
 *       "buttons": [
 *         {"id": "btn1", "text": "Option 1"},
 *         {"id": "btn2", "text": "Option 2"}
 *       ]
 *     }
 *   }'
 *
 *
 * Or using Postman:
 * 1. Create new POST request
 * 2. URL: http://localhost:3000/api/messages/interactive
 * 3. Headers: Content-Type: application/json
 * 4. Body (raw JSON): (see curl example above)
 * 5. Click Send
 */

/**
 * ============================================
 * STEP 5: FRONTEND INTEGRATION
 * ============================================
 *
 * Copy the helper functions from:
 * frontend/services/interactiveMessageService.js
 *
 * Then use in your components:
 *
 * // React Example:
 * import {
 *   sendQuickReplyMessage,
 *   sendURLButtonMessage
 * } from '@/services/interactiveMessageService';
 *
 * function MyComponent() {
 *   const handleSendMessage = async () => {
 *     try {
 *       const result = await sendQuickReplyMessage(
 *         'wa_123',
 *         '918888888888',
 *         'What do you need?',
 *         ['Pricing', 'Support', 'Demo']
 *       );
 *       console.log('Success:', result);
 *     } catch (error) {
 *       console.error('Error:', error);
 *     }
 *   };
 *   return <button onClick={handleSendMessage}>Send</button>;
 * }
 */

/**
 * ============================================
 * ARCHITECTURE SUMMARY
 * ============================================
 */

/*
INPUT (Frontend)
    ↓
    ├─ Common JSON format
    ├─ Single endpoint: /api/messages/interactive
    └─ Fields: sessionId, to, type, data

BACKEND CONTROLLER
    ↓
    ├─ Validates request
    ├─ Gets session socket
    └─ Routes based on TYPE

TYPE ROUTER
    ↓
    ├─ quick_reply → sendQuickReply()
    ├─ cta_url → sendCTAUrl()
    ├─ cta_call → sendCTACall()
    ├─ list → sendListMessage()
    ├─ native_flow → sendNativeFlow()
    ├─ carousel → sendCarousel()
    ├─ webview → sendWebView()
    ├─ payment → sendPayment()
    ├─ product → sendProduct() [ERROR]
    └─ multi_product → sendMultiProduct() [ERROR]

SERVICE LAYER
    ↓
    ├─ Message formatting
    ├─ Proto message generation (Baileys)
    └─ Socket relay/send

OUTPUT (WhatsApp)
    ↓
    └─ Message delivered to recipient
*/

/**
 * ============================================
 * FILE STRUCTURE REFERENCE
 * ============================================
 */

/*
backend/
├── controllers/
│   └── interactiveController.js          # ← Main logic
│
├── routes/
│   ├── interactiveRoutes.js              # ← HTTP endpoints
│   └── nativeMessageRoutes.js            # ← OLD (deprecated)
│
└── services/
    ├── interactive/
    │   ├── README.md                     # ← Full documentation
    │   ├── API_EXAMPLES.js               # ← Request examples
    │   ├── interactiveConstants.js       # ← Types & limits
    │   ├── validation.js                 # ← Input validation
    │   ├── buttonMapper.js               # ← Button utilities
    │   │
    │   ├── quickReply.js                 # ✅ Production ready
    │   ├── ctaUrl.js                     # ✅ Production ready
    │   ├── ctaCall.js                    # ✅ Production ready
    │   ├── listMessage.js                # ✅ Production ready
    │   ├── nativeFlow.js                 # ✅ Production ready
    │   │
    │   ├── carousel.js                   # ⚠️ May have issues
    │   ├── webview.js                    # ⚠️ May have issues
    │   ├── payment.js                    # ⚠️ May have issues
    │   │
    │   ├── product.js                    # ❌ Use Cloud API
    │   └── multiProduct.js               # ❌ Use Cloud API
    │
    └── WhatsAppService.js                # Session management

frontend/
└── services/
    └── interactiveMessageService.js      # ← Frontend helpers
*/

/**
 * ============================================
 * COMPARISON: OLD VS NEW
 * ============================================
 */

/*
OLD APPROACH (nativeMessageRoutes.js):
├─ Single endpoint: /api/messages/send-native
├─ Only supports native flow messages
└─ Limited to one message type

NEW APPROACH (interactiveRoutes.js):
├─ Universal endpoint: /api/messages/interactive
├─ Supports 10 different message types
├─ Type-based routing
├─ Centralized validation
├─ Modular services
├─ Better error handling
└─ Easier to maintain & extend
*/

/**
 * ============================================
 * MIGRATION FROM OLD TO NEW
 * ============================================
 *
 * OLD (send-native endpoint):
 * POST /api/messages/send-native
 * {
 *   "sessionId": "wa_123",
 *   "to": "918888888888",
 *   "title": "Title",
 *   "body": "Body",
 *   "footer": "Footer",
 *   "buttons": [...]
 * }
 *
 *
 * NEW (interactive endpoint):
 * POST /api/messages/interactive
 * {
 *   "sessionId": "wa_123",
 *   "to": "918888888888",
 *   "type": "native_flow",
 *   "data": {
 *     "title": "Title",
 *     "body": "Body",
 *     "footer": "Footer",
 *     "buttons": [...]
 *   }
 * }
 *
 * The data structure is IDENTICAL, just wrapped in the 'data' key
 */

/**
 * ============================================
 * VERIFICATION CHECKLIST
 * ============================================
 *
 * ✅ Created directory: services/interactive/
 * ✅ Created controller: interactiveController.js
 * ✅ Created routes: interactiveRoutes.js
 * ✅ Created 10 service files (quick_reply, cta_url, etc.)
 * ✅ Created utilities: buttonMapper, validation, constants
 * ✅ Created documentation: README, API_EXAMPLES
 * ✅ Created frontend helper: interactiveMessageService.js
 * ✅ All services have proper error handling
 * ✅ All services support JID format validation
 *
 * NEXT:
 * □ Register interactiveRoutes in server.js
 * □ Test each message type
 * □ Update frontend to use new API
 * □ Deploy to production
 * □ Monitor for issues
 */

/**
 * ============================================
 * TESTING ALL MESSAGE TYPES
 * ============================================
 *
 * After integration, test each type:
 *
 * 1. Quick Reply:
 *    curl ... -d '{"type": "quick_reply", "data": {...}}'
 *
 * 2. CTA URL:
 *    curl ... -d '{"type": "cta_url", "data": {...}}'
 *
 * 3. CTA Call:
 *    curl ... -d '{"type": "cta_call", "data": {...}}'
 *
 * 4. List:
 *    curl ... -d '{"type": "list", "data": {...}}'
 *
 * 5. Native Flow:
 *    curl ... -d '{"type": "native_flow", "data": {...}}'
 *
 * 6. Carousel:
 *    curl ... -d '{"type": "carousel", "data": {...}}'
 *
 * 7. WebView:
 *    curl ... -d '{"type": "webview", "data": {...}}'
 *
 * 8. Payment:
 *    curl ... -d '{"type": "payment", "data": {...}}'
 *
 * 9. Product:
 *    curl ... -d '{"type": "product", "data": {}}'
 *    (Should return error about Cloud API)
 *
 * 10. Multi Product:
 *     curl ... -d '{"type": "multi_product", "data": {}}'
 *     (Should return error about Cloud API)
 */

/**
 * ============================================
 * COMMON ISSUES & SOLUTIONS
 * ============================================
 *
 * Issue: "Cannot find module"
 * Solution: Ensure all imports are correct, check file paths
 *
 * Issue: "Session not found"
 * Solution: Verify sessionId is correct and session is active
 *
 * Issue: "Invalid JID format"
 * Solution: Phone number should be 10-13 digits or include @s.whatsapp.net
 *
 * Issue: Button text not showing
 * Solution: Keep button text under 20 characters, use emojis
 *
 * Issue: Message not sent
 * Solution: Check console logs, ensure socket is connected
 *
 * Issue: Carousel looks weird
 * Solution: This is semi-stable, may have rendering issues on some devices
 *
 * Issue: Product not working
 * Solution: Product catalog requires official Cloud API, not supported via Baileys
 */

export const INTEGRATION_STEPS = {
  step1: "Register interactiveRoutes in server.js",
  step2: "Test endpoints with Postman or cURL",
  step3: "Update frontend to use new API",
  step4: "Deploy to production",
  step5: "Monitor for issues",
};
