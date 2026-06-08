/**
 * Startup environment validation.
 *
 * Call `validateEnv()` early in the application lifecycle
 * (e.g. from `next.config.ts` or a top-level server module)
 * to fail fast when required environment variables are missing.
 */

type EnvRule = {
  name: string;
  required: boolean;
  /** Optional validation regex */
  pattern?: RegExp;
  /** Human-readable hint */
  hint?: string;
};

const RULES: EnvRule[] = [
  // Exchange URLs — have safe defaults so not strictly required
  { name: "BINANCE_FUTURES_URL", required: false },
  { name: "BINANCE_SPOT_URL", required: false },
  { name: "OKX_URL", required: false },
  { name: "BYBIT_URL", required: false },
  // Data directory — has safe default
  { name: "DATA_DIR", required: false },
  // Next.js defaults
  { name: "NODE_ENV", required: false },
];

const READ_ONLY_WARNING = `
╔══════════════════════════════════════════════════════════╗
║  只读模式  READ-ONLY MODE                               ║
║                                                          ║
║  本应用仅使用公开市场数据，不连接 API Key，              ║
║  不读取账户，不下单，不交易。                             ║
║                                                          ║
║  This application uses public market data only.           ║
║  No API keys, no account access, no trading.              ║
╚══════════════════════════════════════════════════════════╝
`;

export function validateEnv(): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  for (const rule of RULES) {
    const value = process.env[rule.name];
    if (rule.required && !value) {
      warnings.push(`缺少必要环境变量: ${rule.name}${rule.hint ? ` — ${rule.hint}` : ""}`);
    }
    if (value && rule.pattern && !rule.pattern.test(value)) {
      warnings.push(`环境变量 ${rule.name} 格式无效: ${value}`);
    }
  }

  return { valid: warnings.length === 0, warnings };
}

/**
 * Guard function that logs a read-only reminder at startup.
 * Call once during server initialization.
 */
export function logReadOnlyGuard(): void {
  if (typeof window === "undefined") {
    console.log(READ_ONLY_WARNING);
  }
}
