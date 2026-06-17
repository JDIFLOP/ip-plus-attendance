/**
 * Centralized, non-secret application configuration constants.
 * Anything host/environment specific is read from env with a sensible fallback,
 * so no URLs/endpoints are hardcoded across components.
 */

/**
 * Public IP-lookup endpoint used to detect the client's outbound public IP for
 * the Wi-Fi / network check on the staff check-in screen.
 * Override per environment via `NEXT_PUBLIC_IP_LOOKUP_URL`.
 */
export const IP_LOOKUP_URL =
  process.env.NEXT_PUBLIC_IP_LOOKUP_URL ?? 'https://api.ipify.org?format=json';
