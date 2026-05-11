/**
 * Multi Product Service
 * Status: ❌ Not Supported via Baileys
 *
 * Multi-product messages are only supported via:
 * - Official Cloud API
 * - Baileys has limited/unstable support
 *
 * Recommended: Use Meta Cloud API directly for better reliability
 *
 * This would require:
 * - Product Catalog ID
 * - Multiple product references
 * - Official API integration
 */

export async function sendMultiProduct(sock, to, data) {
  throw new Error(
    "Multi Product messages are not reliably supported via Baileys. Use Meta Cloud API directly for better stability and features.",
  );
}
