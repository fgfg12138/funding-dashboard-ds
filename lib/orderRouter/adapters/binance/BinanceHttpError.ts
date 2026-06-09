/**
 * Binance HTTP Error — Binance Real Order Adapter
 *
 * Structured error for Binance API non-2xx responses.
 * Secret is NEVER included in the error message.
 */

export class BinanceHttpError extends Error {
  /** HTTP status code. */
  public readonly status: number;

  /** Binance API error code (e.g. -2010). */
  public readonly code?: number;

  /** API path that was called. */
  public readonly path: string;

  constructor(status: number, body: Record<string, unknown>, path: string) {
    const binanceMsg = body.msg ?? body.message ?? "";
    const binanceCode = body.code !== undefined ? Number(body.code) : undefined;
    const msg = `Binance API error (${status}): ${binanceMsg}`;

    super(msg);
    this.name = "BinanceHttpError";
    this.status = status;
    this.code = binanceCode;
    this.path = path;
  }
}
