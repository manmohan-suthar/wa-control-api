/**
 * Interactive Messages Validation Utilities
 */

import { LIMITS } from "./interactiveConstants.js";

/**
 * Validate message type
 */
export function validateType(type) {
  const validTypes = [
    "quick_reply",
    "cta_url",
    "cta_call",
    "list",
    "native_flow",
    "carousel",
    "webview",
    "payment",
    "product",
    "multi_product",
  ];

  if (!validTypes.includes(type)) {
    throw new Error(
      `Invalid type "${type}". Must be one of: ${validTypes.join(", ")}`,
    );
  }
}

/**
 * Validate phone number format
 */
export function validatePhoneNumber(phone) {
  if (!phone || typeof phone !== "string") {
    throw new Error("Phone number must be a non-empty string");
  }

  // Remove spaces, hyphens, parentheses
  const cleaned = phone.replace(/[\s\-\(\)]/g, "");

  // Must start with + or be numeric
  if (!cleaned.startsWith("+") && !/^\d+$/.test(cleaned)) {
    throw new Error("Invalid phone number format");
  }

  // Should be at least 10 digits
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (digitsOnly.length < 10) {
    throw new Error("Phone number too short");
  }

  return cleaned;
}

/**
 * Validate recipient (phone or jid)
 */
export function validateRecipient(to) {
  if (!to || typeof to !== "string") {
    throw new Error("Recipient must be a non-empty string");
  }

  // If already JID format, validate format
  if (to.includes("@s.whatsapp.net")) {
    if (!to.match(/^\d+@s\.whatsapp\.net$/)) {
      throw new Error("Invalid JID format");
    }
    return to;
  }

  // If phone number, validate and format
  const validated = validatePhoneNumber(to);
  return `${validated.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
}

/**
 * Validate button text length
 */
export function validateButtonText(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Button text must be a non-empty string");
  }

  if (text.length > LIMITS.MAX_BUTTON_TEXT_LENGTH) {
    throw new Error(
      `Button text too long. Max ${LIMITS.MAX_BUTTON_TEXT_LENGTH} characters`,
    );
  }

  return text;
}

/**
 * Validate body text
 */
export function validateBody(body) {
  if (!body || typeof body !== "string") {
    throw new Error("Body must be a non-empty string");
  }

  if (body.length > LIMITS.MAX_BODY_LENGTH) {
    throw new Error(
      `Body text too long. Max ${LIMITS.MAX_BODY_LENGTH} characters`,
    );
  }

  return body;
}

/**
 * Validate footer text
 */
export function validateFooter(footer) {
  if (footer && typeof footer !== "string") {
    throw new Error("Footer must be a string");
  }

  if (footer && footer.length > LIMITS.MAX_FOOTER_LENGTH) {
    throw new Error(
      `Footer text too long. Max ${LIMITS.MAX_FOOTER_LENGTH} characters`,
    );
  }

  return footer || "";
}

/**
 * Validate URL
 */
export function validateURL(url) {
  if (!url || typeof url !== "string") {
    throw new Error("URL must be a non-empty string");
  }

  try {
    new URL(url);
    return url;
  } catch {
    throw new Error("Invalid URL format");
  }
}

/**
 * Validate quick reply buttons
 */
export function validateQuickReplyButtons(buttons) {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    throw new Error("Buttons must be a non-empty array");
  }

  if (buttons.length > LIMITS.MAX_BUTTONS) {
    throw new Error(`Max ${LIMITS.MAX_BUTTONS} buttons allowed`);
  }

  buttons.forEach((btn, idx) => {
    if (!btn.id || typeof btn.id !== "string") {
      throw new Error(`Button ${idx}: id is required (string)`);
    }

    if (!btn.text || typeof btn.text !== "string") {
      throw new Error(`Button ${idx}: text is required (string)`);
    }

    validateButtonText(btn.text);
  });

  return buttons;
}

/**
 * Validate CTA URL buttons
 */
export function validateCTAUrlButtons(buttons) {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    throw new Error("Buttons must be a non-empty array");
  }

  if (buttons.length > LIMITS.MAX_BUTTONS) {
    throw new Error(`Max ${LIMITS.MAX_BUTTONS} buttons allowed`);
  }

  buttons.forEach((btn, idx) => {
    if (!btn.text || typeof btn.text !== "string") {
      throw new Error(`Button ${idx}: text is required (string)`);
    }

    if (!btn.url || typeof btn.url !== "string") {
      throw new Error(`Button ${idx}: url is required (string)`);
    }

    validateButtonText(btn.text);
    validateURL(btn.url);
  });

  return buttons;
}

/**
 * Validate CTA Call buttons
 */
export function validateCTACallButtons(buttons) {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    throw new Error("Buttons must be a non-empty array");
  }

  if (buttons.length > LIMITS.MAX_BUTTONS) {
    throw new Error(`Max ${LIMITS.MAX_BUTTONS} buttons allowed`);
  }

  buttons.forEach((btn, idx) => {
    if (!btn.text || typeof btn.text !== "string") {
      throw new Error(`Button ${idx}: text is required (string)`);
    }

    if (!btn.phone || typeof btn.phone !== "string") {
      throw new Error(`Button ${idx}: phone is required (string)`);
    }

    validateButtonText(btn.text);
    validatePhoneNumber(btn.phone);
  });

  return buttons;
}

/**
 * Validate list sections
 */
export function validateListSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error("Sections must be a non-empty array");
  }

  if (sections.length > LIMITS.MAX_LIST_SECTIONS) {
    throw new Error(`Max ${LIMITS.MAX_LIST_SECTIONS} sections allowed`);
  }

  sections.forEach((section, sIdx) => {
    if (!section.title || typeof section.title !== "string") {
      throw new Error(`Section ${sIdx}: title is required (string)`);
    }

    if (!Array.isArray(section.rows) || section.rows.length === 0) {
      throw new Error(`Section ${sIdx}: rows must be a non-empty array`);
    }

    if (section.rows.length > LIMITS.MAX_LIST_ROWS_PER_SECTION) {
      throw new Error(
        `Section ${sIdx}: max ${LIMITS.MAX_LIST_ROWS_PER_SECTION} rows allowed`,
      );
    }

    section.rows.forEach((row, rIdx) => {
      if (!row.id || typeof row.id !== "string") {
        throw new Error(`Section ${sIdx}, Row ${rIdx}: id is required`);
      }

      if (!row.title || typeof row.title !== "string") {
        throw new Error(`Section ${sIdx}, Row ${rIdx}: title is required`);
      }
    });
  });

  return sections;
}

/**
 * Validate carousel cards
 */
export function validateCarouselCards(cards) {
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error("Cards must be a non-empty array");
  }

  if (cards.length > LIMITS.MAX_CAROUSEL_CARDS) {
    throw new Error(`Max ${LIMITS.MAX_CAROUSEL_CARDS} cards allowed`);
  }

  cards.forEach((card, idx) => {
    if (!card.title || typeof card.title !== "string") {
      throw new Error(`Card ${idx}: title is required (string)`);
    }

    if (card.body && typeof card.body !== "string") {
      throw new Error(`Card ${idx}: body must be a string`);
    }

    if (card.footer && typeof card.footer !== "string") {
      throw new Error(`Card ${idx}: footer must be a string`);
    }

    if (card.buttons) {
      if (!Array.isArray(card.buttons) || card.buttons.length === 0) {
        throw new Error(`Card ${idx}: buttons must be a non-empty array`);
      }

      card.buttons.forEach((btn, bIdx) => {
        if (!btn.text) {
          throw new Error(`Card ${idx}, Button ${bIdx}: text is required`);
        }
        if (!btn.url) {
          throw new Error(`Card ${idx}, Button ${bIdx}: url is required`);
        }
        validateURL(btn.url);
      });
    }
  });

  return cards;
}

/**
 * Validate entire message payload
 */
export function validateMessagePayload(payload) {
  const errors = [];

  // Required fields
  if (!payload.sessionId) errors.push("sessionId is required");
  if (!payload.to) errors.push("to (recipient) is required");
  if (!payload.type) errors.push("type is required");
  if (!payload.data) errors.push("data is required");

  if (errors.length > 0) {
    throw new Error(errors.join(", "));
  }

  // Validate type
  try {
    validateType(payload.type);
  } catch (err) {
    throw err;
  }

  // Validate recipient
  try {
    validateRecipient(payload.to);
  } catch (err) {
    throw err;
  }

  return payload;
}
