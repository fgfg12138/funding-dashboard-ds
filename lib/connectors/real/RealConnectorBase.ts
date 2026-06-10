/**
 * Real Connector Base — Real Connector Framework (Read-Only)
 *
 * Abstract base class for real exchange connectors using native fetch.
 * Only public GET endpoints — no API keys, no trading.
 *
 * Subclasses must provide:
 *   exchangeId, baseUrl, getExchangeSymbol(),
 *   fetchFundingInfo(), fetchTradingRules()
 */

import type { ExchangeConnector, ConnectorOrderRequest, ConnectorOrderResult } from "../connectorTypes";
import type { TradingRule } from "../tradingRule";
import type { FundingInfo } from "../fundingInfo";
import type { InFlightOrder } from "../inFlightOrder";
import type { ConnectorHealth } from "../connectorHealth";

// ─── Base Class ───────────────────────────────────────

export abstract class RealConnectorBase implements ExchangeConnector {
  abstract readonly exchangeId: string;
  abstract readonly baseUrl: string;
  readonly supportsUserStream = false;

  /** Map canonical symbol → exchange symbol. */
  protected abstract getExchangeSymbol(canonical: string): string;

  /** Fetch raw funding data and return FundingInfo for a canonical symbol. */
  protected abstract fetchFundingInfo(canonicalSymbol: string): Promise<FundingInfo | undefined>;

  /** Fetch raw exchange info and return TradingRule[]. */
  protected abstract fetchTradingRules(): Promise<TradingRule[]>;

  /** Health check endpoint path (e.g. "/fapi/v1/ping"). */
  protected abstract healthCheckPath: string;

  // Cached trading rules (refreshed on connect)
  private _tradingRules: TradingRule[] | null = null;
  private _health: ConnectorHealth = { exchangeId: this.exchangeId, status: "healthy", updatedAt: Date.now() };

  // ── HTTP Helper ───────────────────────────────────

  protected async publicGet(path: string): Promise<Record<string, unknown> | Array<unknown>> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, { method: "GET", headers: { "Accept": "application/json" } });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${this.exchangeId}: ${url}`);
    }
    return response.json() as Promise<Record<string, unknown> | Array<unknown>>;
  }

  // ── Connect / Disconnect ──────────────────────────

  async connect(): Promise<void> {
    // Refresh trading rules on connect
    this._tradingRules = await this.fetchTradingRules();
  }

  async disconnect(): Promise<void> {
    this._tradingRules = null;
  }

  // ── Trading Rules ────────────────────────────────

  async getTradingRules(): Promise<TradingRule[]> {
    if (!this._tradingRules) {
      this._tradingRules = await this.fetchTradingRules();
    }
    return [...this._tradingRules];
  }

  // ── Funding Info ────────────────────────────────

  async getFundingInfo(canonicalSymbol: string): Promise<FundingInfo | undefined> {
    return this.fetchFundingInfo(canonicalSymbol);
  }

  // ── Health ──────────────────────────────────────

  async getHealth(): Promise<ConnectorHealth> {
    try {
      const start = Date.now();
      await this.publicGet(this.healthCheckPath);
      return {
        exchangeId: this.exchangeId,
        status: "healthy",
        lastRestLatencyMs: Date.now() - start,
        updatedAt: Date.now(),
      };
    } catch {
      return { exchangeId: this.exchangeId, status: "down", updatedAt: Date.now() };
    }
  }

  // ── ⛔ TRADING DISABLED — Read-Only Mode ────────

  async getOpenOrders(): Promise<InFlightOrder[]> {
    throw new Error("Trading disabled in read-only connector");
  }

  async getBalances(): Promise<Record<string, number>> {
    throw new Error("Trading disabled in read-only connector");
  }

  async getPositions(): Promise<Array<{ symbol: string; side: string; quantity: number; entryPrice: number }>> {
    throw new Error("Trading disabled in read-only connector");
  }

  async createOrder(_request: ConnectorOrderRequest): Promise<ConnectorOrderResult> {
    throw new Error("Trading disabled in read-only connector");
  }

  async cancelOrder(_orderId: string, _canonicalSymbol: string): Promise<ConnectorOrderResult> {
    throw new Error("Trading disabled in read-only connector");
  }

  async getOrder(_orderId: string, _canonicalSymbol: string): Promise<InFlightOrder | undefined> {
    throw new Error("Trading disabled in read-only connector");
  }
}
