/**
 * Product Service
 * Status: ❌ Not Supported via Baileys
 *
 * Native product UI requires:
 * - WhatsApp Business verified catalog
 * - Meta Commerce Manager setup
 * - Official Cloud API (not supported by Baileys)
 *
 * Recommended: Use Cloud API directly for this
 */

export async function sendProduct(sock, to, data) {
  throw new Error(
    "Product Catalog is not supported via Baileys. Use Meta Cloud API directly. Requires: 1) WhatsApp Business verification 2) Commerce Manager setup 3) Official API access",
  );
}
