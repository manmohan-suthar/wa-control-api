/**
 * Universal Button Mapper
 * Converts frontend button format to Baileys-compatible format
 */

const serializeButtonParams = (btn) => {
  if (btn?.params && typeof btn.params === "object") {
    return JSON.stringify(btn.params);
  }

  if (typeof btn?.buttonParamsJson === "string") {
    return btn.buttonParamsJson;
  }

  return JSON.stringify(btn?.params || {});
};

// ✅ Working — nativeFlowMessage ke saath use karo
export function buildButtons(buttons = []) {
  return buttons.map((btn) => {
    switch (btn.type) {
      case "quick_reply":
        return {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: btn.text || btn.params?.display_text,
            id: btn.id || btn.params?.id,
          }),
        };

      case "cta_url":
        return {
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: btn.text || btn.params?.display_text,
            url: btn.url || btn.params?.url,
            merchant_url: btn.url || btn.params?.url,
          }),
        };

      case "cta_call":
        return {
          name: "cta_call",
          buttonParamsJson: JSON.stringify({
            display_text: btn.text || btn.params?.display_text,
            phone_number: btn.phone || btn.params?.phone_number,
          }),
        };

      case "cta_copy":
        return {
          name: "cta_copy",
          buttonParamsJson: JSON.stringify({
            display_text: btn.text || btn.params?.display_text,
            copy_code: btn.code || btn.params?.copy_code,
          }),
        };

      default:
        // Fallback — direct params use karo
        return {
          name: btn.type || btn.name,
          buttonParamsJson: serializeButtonParams(btn),
        };
    }
  });
}

export function buildNativeFlowButtons(buttons = []) {
  return buttons.map((btn) => ({
    name: btn.name || btn.type,
    buttonParamsJson: serializeButtonParams(btn),
  }));
}

// ❌ DEPRECATED — use nahi karo
// export function buildQuickReplyButtons() {}

// ✅ Validation
export function validateButtons(buttons) {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    throw new Error("Buttons must be a non-empty array");
  }

  if (buttons.length > 3) {
    throw new Error("Maximum 3 buttons allowed");
  }

  const validTypes = ["quick_reply", "cta_url", "cta_call", "cta_copy"];
  for (const btn of buttons) {
    if (!validTypes.includes(btn.type)) {
      throw new Error(
        `Invalid button type: ${btn.type}. Valid: ${validTypes.join(", ")}`,
      );
    }
  }

  return true;
}

export function validateNativeFlowButtons(buttons) {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    throw new Error("Buttons must be a non-empty array");
  }

  if (buttons.length > 10) {
    throw new Error("Maximum 10 buttons allowed");
  }

  buttons.forEach((btn, index) => {
    if (!btn || typeof btn !== "object") {
      throw new Error(`Button ${index}: must be an object`);
    }

    if (!btn.name || typeof btn.name !== "string") {
      throw new Error(`Button ${index}: name is required (string)`);
    }

    if (btn.params && typeof btn.params === "object") {
      return;
    }

    if (typeof btn.buttonParamsJson === "string") {
      return;
    }

    if (!btn.params || typeof btn.params !== "object") {
      throw new Error(`Button ${index}: params is required (object)`);
    }
  });

  return true;
}
