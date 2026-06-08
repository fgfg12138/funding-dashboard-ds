import type { NormalizedSymbol } from "../exchanges/types";

const KNOWN_QUOTES = ["USDT", "USDC", "USD", "BTC", "ETH"];

export function normalizeSymbol(rawSymbol: string): NormalizedSymbol {
  const upper = rawSymbol.toUpperCase();
  const parts = upper.split("-").filter((part) => part && part !== "SWAP" && part !== "PERP");

  if (parts.length >= 2) {
    return makeSymbol(parts[0], parts[1]);
  }

  const quote = KNOWN_QUOTES.find((candidate) => upper.endsWith(candidate));
  if (!quote) {
    return makeSymbol(upper, "");
  }

  return makeSymbol(upper.slice(0, -quote.length), quote);
}

export function makeSymbol(base: string, quote: string): NormalizedSymbol {
  return {
    base,
    quote,
    symbol: quote ? `${base}/${quote}` : base
  };
}
