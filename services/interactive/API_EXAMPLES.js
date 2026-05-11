/**
 * ============================================
 * INTERACTIVE MESSAGES API DOCUMENTATION
 * ============================================
 *
 * Universal endpoint for all WhatsApp interactive messages
 * BASE URL: POST /api/messages/interactive
 *
 * This centralized API handles all message types dynamically.
 * Frontend sends a common JSON format, backend routes to appropriate service.
 */

/**
 * ============================================
 * 1. QUICK REPLY BUTTONS
 * ============================================
 * Status: ✅ Fully Stable
 * Use: Simple button responses, menu selection
 *
 * Request:
 */
const quickReplyExample = {
  sessionId: "wa_1234567890",
  to: "918888888888",
  type: "quick_reply",
  data: {
    body: "Welcome! Choose an option:",
    footer: "Suthar Tech",
    buttons: [
      { id: "pricing", text: "💰 Pricing" },
      { id: "support", text: "🆘 Support" },
      { id: "docs", text: "📚 Docs" },
    ],
  },
};

/**
 * ============================================
 * 2. CTA URL BUTTON
 * ============================================
 * Status: ✅ Fully Stable
 * Use: External website links, resource redirects
 *
 * Request:
 */
const ctaUrlExample = {
  sessionId: "wa_1234567890",
  to: "918888888888",
  type: "cta_url",
  data: {
    body: "Visit our website to learn more",
    footer: "Click the button below",
    buttons: [
      {
        text: "🌐 Visit Website",
        url: "https://suthartech.com",
      },
      {
        text: "📱 Download App",
        url: "https://play.google.com/store/apps/details?id=com.suthartech",
      },
    ],
  },
};

/**
 * ============================================
 * 3. CTA CALL BUTTON
 * ============================================
 * Status: ✅ Fully Stable
 * Use: Direct phone calls, customer support
 *
 * Request:
 */
const ctaCallExample = {
  sessionId: "wa_1234567890",
  to: "918888888888",
  type: "cta_call",
  data: {
    body: "Need immediate help? Call our support team",
    footer: "24/7 Support Available",
    buttons: [
      {
        text: "☎️ Call Support",
        phone: "+919876543210",
      },
      {
        text: "📞 Sales Team",
        phone: "+919123456789",
      },
    ],
  },
};

/**
 * ============================================
 * 4. LIST MESSAGE
 * ============================================
 * Status: ✅ Fully Stable
 * Use: Large menus, categorized options, multiple choices
 *
 * Request:
 */
const listMessageExample = {
  sessionId: "wa_1234567890",
  to: "918888888888",
  type: "list",
  data: {
    body: "Select a service category",
    footer: "We offer comprehensive solutions",
    title: "Our Services",
    buttonText: "📋 View Options",
    sections: [
      {
        title: "🛠️ Development",
        rows: [
          { id: "web_dev", title: "Web Development" },
          { id: "app_dev", title: "Mobile App Development" },
          { id: "ai_dev", title: "AI/ML Solutions" },
        ],
      },
      {
        title: "📊 Consulting",
        rows: [
          { id: "tech_consult", title: "Tech Consulting" },
          { id: "business_consult", title: "Business Strategy" },
        ],
      },
      {
        title: "🎓 Training",
        rows: [
          { id: "web_training", title: "Web Development Course" },
          { id: "mobile_training", title: "Mobile Development Course" },
        ],
      },
    ],
  },
};

/**
 * ============================================
 * 5. NATIVE FLOW
 * ============================================
 * Status: ✅ Fully Stable
 * Use: Complex interactive flows, advanced selections
 *
 * Request:
 */
const nativeFlowExample = {
  sessionId: "wa_1234567890",
  to: "918888888888",
  type: "native_flow",
  data: {
    title: "🎯 Select Your Plan",
    body: "Choose the perfect plan for your business",
    footer: "Suthar Tech Solutions",
    buttons: [
      {
        name: "single_select",
        params: {
          title: "Available Plans",
          sections: [
            {
              title: "💰 Pricing Plans",
              rows: [
                {
                  id: "starter",
                  title: "Starter Plan",
                },
                {
                  id: "professional",
                  title: "Professional Plan",
                },
                {
                  id: "enterprise",
                  title: "Enterprise Plan",
                },
              ],
            },
          ],
        },
      },
    ],
  },
};

/**
 * ============================================
 * 6. CAROUSEL (Multi-Card Message)
 * ============================================
 * Status: ⚠️ Semi Stable
 * Use: Product showcase, pricing comparison, portfolio display
 * Note: May have occasional rendering issues
 *
 * Request:
 */
const carouselExample = {
  sessionId: "wa_1234567890",
  to: "918888888888",
  type: "carousel",
  data: {
    cards: [
      {
        title: "⚡ Starter Plan",
        body: "Perfect for beginners",
        footer: "₹999/month",
        buttons: [
          {
            text: "Learn More",
            url: "https://suthartech.com/pricing/starter",
          },
        ],
      },
      {
        title: "🚀 Professional",
        body: "For growing businesses",
        footer: "₹2999/month",
        buttons: [
          {
            text: "Get Started",
            url: "https://suthartech.com/pricing/pro",
          },
        ],
      },
      {
        title: "👑 Enterprise",
        body: "Full-featured solution",
        footer: "Custom pricing",
        buttons: [
          {
            text: "Contact Sales",
            url: "https://suthartech.com/contact",
          },
        ],
      },
    ],
  },
};

/**
 * ============================================
 * 7. WEBVIEW BUTTON
 * ============================================
 * Status: ⚠️ Semi Stable
 * Use: Embedded custom UI, advanced interactions
 * Note: Opens in WhatsApp's embedded browser
 *
 * Request:
 */
const webviewExample = {
  sessionId: "wa_1234567890",
  to: "918888888888",
  type: "webview",
  data: {
    body: "View your dashboard",
    footer: "Click to open your account",
    buttons: [
      {
        text: "📊 Open Dashboard",
        url: "https://dashboard.suthartech.com/user?wa_id=918888888888",
      },
    ],
  },
};

/**
 * ============================================
 * 8. PAYMENT BUTTON
 * ============================================
 * Status: ⚠️ Semi Stable (India UPI)
 * Use: Payment collection, transaction links
 * Supports: UPI deep links, Razorpay, Stripe
 *
 * Request:
 */
const paymentExample = {
  sessionId: "wa_1234567890",
  to: "918888888888",
  type: "payment",
  data: {
    body: "Complete your order payment",
    footer: "Secure & Encrypted",
    buttons: [
      {
        text: "💳 Pay ₹999",
        url: "https://rzp.io/i/abc123xyz", // Razorpay link
      },
      {
        text: "📲 UPI Payment",
        url: "upi://pay?pa=business@upi&pn=SutharTech&am=999&tn=Order%20Payment",
      },
    ],
  },
};

/**
 * ============================================
 * NOT SUPPORTED VIA BAILEYS
 * ============================================
 */

/**
 * 9. PRODUCT CATALOG
 * Status: ❌ NOT SUPPORTED
 * Requires: WhatsApp Business verification + Meta Commerce Manager
 * Solution: Use Meta Cloud API directly
 */

/**
 * 10. MULTI PRODUCT MESSAGE
 * Status: ❌ NOT SUPPORTED
 * Requires: Official catalog + Cloud API
 * Solution: Use Meta Cloud API directly
 */

/**
 * ============================================
 * BEST PRACTICES
 * ============================================
 */

/*
 * 1. BUTTON TEXT LENGTH
 *    Max 20 characters for best display
 *    Example: "💰 Pricing" instead of "Click here for pricing information"
 *
 * 2. BODY TEXT
 *    Keep concise, max 1024 characters
 *    Use emojis for visual appeal
 *    Clear action-oriented text
 *
 * 3. BUTTON COUNT
 *    Max 10 buttons per message
 *    Quick reply: 3-4 buttons optimal
 *    List: Unlimited rows in sections
 *
 * 4. RESPONSE HANDLING
 *    Store button IDs for webhook processing
 *    Map user selections to your system
 *    Log all interactions for analytics
 *
 * 5. ERROR HANDLING
 *    Always check sessionId exists
 *    Validate phone format (add @s.whatsapp.net if needed)
 *    Handle network timeouts gracefully
 *    Provide fallback for unsupported features
 */

/**
 * ============================================
 * FRONTEND INTEGRATION
 * ============================================
 *
 * // Unified sender function
 * async function sendInteractiveMessage(config) {
 *   const response = await fetch('/api/messages/interactive', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify(config)
 *   });
 *   return response.json();
 * }
 *
 * // Usage examples:
 * sendInteractiveMessage({
 *   sessionId: 'wa_xxx',
 *   to: '918888888888',
 *   type: 'quick_reply',
 *   data: { body: 'Hello', buttons: [...] }
 * });
 *
 * sendInteractiveMessage({
 *   sessionId: 'wa_xxx',
 *   to: '918888888888',
 *   type: 'cta_url',
 *   data: { body: 'Visit', buttons: [{text: 'Click', url: '...'}] }
 * });
 */

/**
 * ============================================
 * WEBHOOK RESPONSE FORMAT
 * ============================================
 *
 * Success Response:
 * {
 *   "success": true,
 *   "message": "Interactive message sent successfully",
 *   "type": "quick_reply"
 * }
 *
 * Error Response:
 * {
 *   "success": false,
 *   "error": "WhatsApp session not found"
 * }
 */

export const API_EXAMPLES = {
  quickReply: quickReplyExample,
  ctaUrl: ctaUrlExample,
  ctaCall: ctaCallExample,
  list: listMessageExample,
  nativeFlow: nativeFlowExample,
  carousel: carouselExample,
  webview: webviewExample,
  payment: paymentExample,
};
