/**
 * Interactive Message Constants and Utilities
 */

export const INTERACTIVE_TYPES = {
  QUICK_REPLY: "quick_reply",
  CTA_URL: "cta_url",
  CTA_CALL: "cta_call",
  LIST: "list",
  NATIVE_FLOW: "native_flow",
  CAROUSEL: "carousel",
  WEBVIEW: "webview",
  PAYMENT: "payment",
  PRODUCT: "product",
  MULTI_PRODUCT: "multi_product",
};

export const STABILITY_STATUS = {
  [INTERACTIVE_TYPES.QUICK_REPLY]: "✅ Fully Stable",
  [INTERACTIVE_TYPES.CTA_URL]: "✅ Fully Stable",
  [INTERACTIVE_TYPES.CTA_CALL]: "✅ Fully Stable",
  [INTERACTIVE_TYPES.LIST]: "✅ Fully Stable",
  [INTERACTIVE_TYPES.NATIVE_FLOW]: "✅ Fully Stable",
  [INTERACTIVE_TYPES.CAROUSEL]: "⚠️ Semi Stable",
  [INTERACTIVE_TYPES.WEBVIEW]: "⚠️ Semi Stable",
  [INTERACTIVE_TYPES.PAYMENT]: "⚠️ Semi Stable (India UPI)",
  [INTERACTIVE_TYPES.PRODUCT]: "❌ Use Cloud API",
  [INTERACTIVE_TYPES.MULTI_PRODUCT]: "❌ Use Cloud API",
};

export const USE_CASES = {
  [INTERACTIVE_TYPES.QUICK_REPLY]:
    "Simple button responses, menu selection, yes/no questions",
  [INTERACTIVE_TYPES.CTA_URL]: "Website links, external resources, redirects",
  [INTERACTIVE_TYPES.CTA_CALL]: "Customer support, sales calls, direct contact",
  [INTERACTIVE_TYPES.LIST]:
    "Multiple options, categorized choices, large menus",
  [INTERACTIVE_TYPES.NATIVE_FLOW]: "Complex flows, multi-step interactions",
  [INTERACTIVE_TYPES.CAROUSEL]:
    "Ecommerce, SaaS plans, product showcase, comparisons",
  [INTERACTIVE_TYPES.WEBVIEW]:
    "Custom UI, embedded experiences, advanced interactions",
  [INTERACTIVE_TYPES.PAYMENT]: "Payment collection, UPI, Razorpay, Stripe",
  [INTERACTIVE_TYPES.PRODUCT]: "Product catalog (requires official setup)",
  [INTERACTIVE_TYPES.MULTI_PRODUCT]:
    "Multiple products (requires official Cloud API)",
};

/**
 * Default payload templates
 */
export const MESSAGE_TEMPLATES = {
  quickReply: {
    type: "quick_reply",
    data: {
      body: "Choose an option",
      footer: "Select your choice",
      buttons: [
        { id: "option1", text: "Option 1" },
        { id: "option2", text: "Option 2" },
      ],
    },
  },

  ctaUrl: {
    type: "cta_url",
    data: {
      body: "Visit our website",
      footer: "Click below",
      buttons: [
        {
          text: "Open Site",
          url: "https://example.com",
        },
      ],
    },
  },

  ctaCall: {
    type: "cta_call",
    data: {
      body: "Need support?",
      footer: "Call us anytime",
      buttons: [
        {
          text: "Call Now",
          phone: "+918888888888",
        },
      ],
    },
  },

  list: {
    type: "list",
    data: {
      body: "Choose from list",
      footer: "Select one",
      title: "Menu",
      buttonText: "Open List",
      sections: [
        {
          title: "Section 1",
          rows: [
            { id: "row1", title: "Row 1" },
            { id: "row2", title: "Row 2" },
          ],
        },
      ],
    },
  },

  nativeFlow: {
    type: "native_flow",
    data: {
      title: "Header",
      body: "Body text",
      footer: "Footer",
      buttons: [
        {
          name: "single_select",
          params: {
            title: "Select",
            sections: [
              {
                title: "Options",
                rows: [{ id: "option1", title: "Option 1" }],
              },
            ],
          },
        },
      ],
    },
  },

  carousel: {
    type: "carousel",
    data: {
      cards: [
        {
          title: "Card 1",
          body: "Description",
          footer: "Price",
          buttons: [
            {
              text: "Learn More",
              url: "https://example.com",
            },
          ],
        },
      ],
    },
  },

  payment: {
    type: "payment",
    data: {
      body: "Complete your payment",
      footer: "Secure payment link",
      buttons: [
        {
          text: "Pay Now",
          url: "https://rzp.io/i/xxxxx",
        },
      ],
    },
  },
};

/**
 * Constraint limits
 */
export const LIMITS = {
  MAX_BUTTONS: 10,
  MAX_CAROUSEL_CARDS: 10,
  MAX_LIST_SECTIONS: 10,
  MAX_LIST_ROWS_PER_SECTION: 50,
  MAX_BODY_LENGTH: 1024,
  MAX_FOOTER_LENGTH: 60,
  MAX_BUTTON_TEXT_LENGTH: 20,
  MAX_TITLE_LENGTH: 128,
};
