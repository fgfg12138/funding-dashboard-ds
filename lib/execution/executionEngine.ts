import type { UnifiedOpportunity } from "../opportunities/types";
import type { ExchangeName } from "../exchanges/types";
import type {
  CreatePaperExecutionInput,
  ExecutionEstimateInput,
  ExecutionEstimateResult,
  ExecutionLeg,
  ExecutionOpportunityType,
  PaperExecution,
} from "./types";

let legIdCounter = 1;

function nextLegId(): string {
  return `leg-${Date.now()}-${legIdCounter++}`;
}

const DEFAULT_NOTIONAL = 1000;
const DEFAULT_FEE_RATE = 0.001; // 0.1 %
const DEFAULT_SLIPPAGE_RATE = 0.0005; // 0.05 %

// ─── Mapping helpers ────────────────────────────────────

/**
 * Convert UnifiedOpportunityType to the normalised ExecutionOpportunityType.
 */
export function toExecutionOpportunityType(
  type: UnifiedOpportunity["opportunityType"],
): ExecutionOpportunityType {
  switch (type) {
    case "CrossExchange":
      return "cross-exchange";
    case "SpotPerp":
      return "spot-perp";
    case "Basis":
      return "basis";
    default:
      return "unknown";
  }
}

/**
 * Build a set of execution legs from a UnifiedOpportunity.
 *
 * CrossExchange  → one short perp + one long perp (different exchanges)
 * SpotPerp       → buy spot + short perp
 * Basis          → buy spot + short perp (same exchange pair as SpotPerp)
 */
export function buildExecutionLegs(opportunity: UnifiedOpportunity): ExecutionLeg[] {
  const legs: ExecutionLeg[] = [];

  switch (opportunity.opportunityType) {
    case "CrossExchange": {
      const exchanges = getExchanges(opportunity);
      // short on first exchange, long on second
      if (exchanges[0]) {
        legs.push({
          id: nextLegId(),
          venue: exchanges[0],
          marketType: "perp",
          side: "short",
          symbol: opportunity.symbol,
          notionalUsd: DEFAULT_NOTIONAL,
          estimatedEntryPrice: 0,
          estimatedFee: DEFAULT_NOTIONAL * DEFAULT_FEE_RATE,
          estimatedSlippage: DEFAULT_NOTIONAL * DEFAULT_SLIPPAGE_RATE,
        });
      }
      if (exchanges[1]) {
        legs.push({
          id: nextLegId(),
          venue: exchanges[1],
          marketType: "perp",
          side: "long",
          symbol: opportunity.symbol,
          notionalUsd: DEFAULT_NOTIONAL,
          estimatedEntryPrice: 0,
          estimatedFee: DEFAULT_NOTIONAL * DEFAULT_FEE_RATE,
          estimatedSlippage: DEFAULT_NOTIONAL * DEFAULT_SLIPPAGE_RATE,
        });
      }
      break;
    }
    case "SpotPerp":
    case "Basis": {
      const exchange = opportunity.primaryExchange;
      // buy spot
      legs.push({
        id: nextLegId(),
        venue: exchange,
        marketType: "spot",
        side: "buy",
        symbol: opportunity.symbol,
        notionalUsd: DEFAULT_NOTIONAL,
        estimatedEntryPrice: 0,
        estimatedFee: DEFAULT_NOTIONAL * DEFAULT_FEE_RATE,
        estimatedSlippage: DEFAULT_NOTIONAL * DEFAULT_SLIPPAGE_RATE,
      });
      // short perp
      legs.push({
        id: nextLegId(),
        venue: exchange,
        marketType: "perp",
        side: "short",
        symbol: opportunity.symbol,
        notionalUsd: DEFAULT_NOTIONAL,
        estimatedEntryPrice: 0,
        estimatedFee: DEFAULT_NOTIONAL * DEFAULT_FEE_RATE,
        estimatedSlippage: DEFAULT_NOTIONAL * DEFAULT_SLIPPAGE_RATE,
      });
      break;
    }
  }

  return legs;
}

// ─── Public API ─────────────────────────────────────────

/**
 * Convert a UnifiedOpportunity into a CreatePaperExecutionInput
 * (ready to pass to executionStore.createPaperExecution or createPaperExecutionFromOpportunity).
 */
export function normalizeOpportunityToExecutionInput(
  opportunity: UnifiedOpportunity,
): CreatePaperExecutionInput {
  const legs = buildExecutionLegs(opportunity);
  const exchanges = getExchanges(opportunity);
  const totalFees = legs.reduce((s, leg) => s + leg.estimatedFee, 0);
  const totalSlippage = legs.reduce((s, leg) => s + leg.estimatedSlippage, 0);

  return {
    opportunityId: opportunity.id,
    opportunityType: toExecutionOpportunityType(opportunity.opportunityType),
    symbol: opportunity.symbol,
    base: opportunity.base,
    quote: opportunity.quote,
    legs,
    sideDescription: opportunity.direction,
    exchanges,
    estimatedAnnualizedRate: opportunity.annualizedRate,
    estimatedFundingRate: opportunity.fundingRate ?? 0,
    estimatedFees: totalFees,
    estimatedSlippage: totalSlippage,
    estimatedNetRate: opportunity.annualizedRate - (totalFees + totalSlippage),
    riskTags: opportunity.riskTags,
  };
}

/**
 * Build a fully-formed PaperExecution from a UnifiedOpportunity.
 * The result is **not persisted** — pass it to `createPaperExecution` on the store.
 *
 * This is the main entry point for the /execution page.
 */
export function createPaperExecutionFromOpportunity(
  opportunity: UnifiedOpportunity,
  now?: number,
): PaperExecution {
  const input = normalizeOpportunityToExecutionInput(opportunity);
  const timestamp = now ?? Date.now();
  const id = generateExecutionId();

  return {
    id,
    opportunityId: input.opportunityId,
    opportunityType: input.opportunityType,
    symbol: input.symbol,
    base: input.base,
    quote: input.quote,
    mode: "paper",
    status: "opened",
    legs: input.legs,
    sideDescription: input.sideDescription,
    exchanges: input.exchanges,
    estimatedAnnualizedRate: input.estimatedAnnualizedRate,
    estimatedFundingRate: input.estimatedFundingRate,
    estimatedFees: input.estimatedFees,
    estimatedSlippage: input.estimatedSlippage,
    estimatedNetRate: input.estimatedNetRate,
    riskTags: input.riskTags,
    createdAt: timestamp,
    updatedAt: timestamp,
    openedAt: timestamp,
    closedAt: null,
    closeReason: null,
  };
}

// ─── Helpers ────────────────────────────────────────────

let execId = 1;

function generateExecutionId(): string {
  return `paper-${Date.now()}-${execId++}`;
}

function getExchanges(opportunity: UnifiedOpportunity): ExchangeName[] {
  const exchanges: ExchangeName[] = [opportunity.primaryExchange];
  if (opportunity.secondaryExchange) {
    exchanges.push(opportunity.secondaryExchange);
  }
  return exchanges;
}

/** For use in tests. */
export function resetEngineIdCounter(): void {
  execId = 1;
  legIdCounter = 1;
}

// ─── Net Return Estimation ──────────────────────────────

const HOURS_PER_YEAR = 8760;

/**
 * Annualize a net return.
 *
 * @param netReturn  Net profit/loss in USD for the holding period.
 * @param notionalUsd  Total notional in USD.
 * @param holdingHours  How many hours the position was held.
 * @returns Annualized net rate as a percentage (e.g. 15.2 = 15.2 %).
 */
export function annualizeReturn(
  netReturn: number,
  notionalUsd: number,
  holdingHours: number,
): number {
  if (notionalUsd <= 0 || holdingHours <= 0) return 0;
  const netRate = netReturn / notionalUsd;
  return (netRate * (HOURS_PER_YEAR / holdingHours)) * 100;
}

/**
 * Estimate gross return for a spot-perp opportunity.
 *
 * Short perp earns the funding rate.  Over `holdingHours` the number of
 * funding settlements is `holdingHours / fundingIntervalHours`.
 */
export function estimateSpotPerpReturns(input: ExecutionEstimateInput): ExecutionEstimateResult {
  const holdingHours = input.holding?.holdingHours ?? 8;
  const intervalHours = input.holding?.fundingIntervalHours ?? 8;
  const settlements = holdingHours / intervalHours;

  // Gross: funding rate per settlement * notional * number of settlements
  const grossReturn = input.fundingRate * input.notionalUsd * settlements;

  return computeResult(input, grossReturn, holdingHours);
}

/**
 * Estimate gross return for a cross-exchange opportunity.
 *
 * The spread comes from the pre-computed annualized percentage.
 * Convert it to a USD return for the holding window.
 */
export function estimateCrossExchangeReturns(input: ExecutionEstimateInput): ExecutionEstimateResult {
  const holdingHours = input.holding?.holdingHours ?? 8;

  // Gross annualized percentage → USD for holding period
  const grossReturn = (input.annualizedRate / 100) * (holdingHours / HOURS_PER_YEAR) * input.notionalUsd;

  return computeResult(input, grossReturn, holdingHours);
}

/**
 * Estimate gross return for a basis opportunity.
 *
 * Basis return is derived from the annualized rate, similar to cross-exchange.
 */
export function estimateBasisReturns(input: ExecutionEstimateInput): ExecutionEstimateResult {
  const holdingHours = input.holding?.holdingHours ?? 8;

  const grossReturn = (input.annualizedRate / 100) * (holdingHours / HOURS_PER_YEAR) * input.notionalUsd;

  return computeResult(input, grossReturn, holdingHours);
}

/**
 * Route to the correct estimator based on opportunity type.
 */
export function estimateExecutionReturns(input: ExecutionEstimateInput): ExecutionEstimateResult {
  switch (input.opportunityType) {
    case "spot-perp":
      return estimateSpotPerpReturns(input);
    case "cross-exchange":
      return estimateCrossExchangeReturns(input);
    case "basis":
      return estimateBasisReturns(input);
    default:
      return estimateCrossExchangeReturns(input);
  }
}

/**
 * Common computation: subtract costs and annualize.
 */
function computeResult(
  input: ExecutionEstimateInput,
  grossReturn: number,
  holdingHours: number,
): ExecutionEstimateResult {
  const fees = input.fees;
  const slippage = input.slippage;
  const netReturn = grossReturn - fees - slippage;
  const netRate = input.notionalUsd > 0 ? netReturn / input.notionalUsd : 0;
  const annualizedNetRate = annualizeReturn(netReturn, input.notionalUsd, holdingHours);

  return {
    grossReturn,
    fees,
    slippage,
    netReturn,
    netRate,
    annualizedNetRate,
    holdingHours,
  };
}
