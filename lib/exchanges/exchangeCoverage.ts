export function formatExchangeCoverage(exchanges: readonly string[]): string {
  return `${new Set(exchanges.filter(Boolean)).size}家`;
}

export function getExchangeCoverageTitle(exchanges: readonly string[]): string {
  return Array.from(new Set(exchanges.filter(Boolean))).join("、");
}
