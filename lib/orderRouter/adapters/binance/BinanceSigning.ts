/**
 * Binance Signing — Binance Real Order Adapter
 *
 * HMAC SHA256 signing for Binance API requests.
 *
 * Pure function — no side effects.
 */

import crypto from "node:crypto";

/**
 * Sign parameters using HMAC SHA256.
 *
 * Sorts keys alphabetically, concatenates as key=value&key=value,
 * then signs with HMAC SHA256.
 *
 * @param params - Flat key-value parameters.
 * @param secret - API secret.
 * @returns The hex-encoded signature.
 */
export function signParams(params: Record<string, string | number | undefined>, secret: string): string {
  // Build query string: sort keys, skip undefined values
  const keys = Object.keys(params).sort();
  const queryString = keys
    .filter((k) => params[k] !== undefined)
    .map((k) => `${k}=${params[k]}`)
    .join("&");

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(queryString, "utf-8");
  return hmac.digest("hex");
}

/**
 * Add a signature to a parameter map.
 *
 * Mutates the params object by adding the "signature" key.
 *
 * @param params - Parameters to sign (in/out, mutated).
 * @param secret - API secret.
 */
export function addSignature(params: Record<string, string | number | undefined>, secret: string): void {
  params.signature = signParams(params, secret);
}
