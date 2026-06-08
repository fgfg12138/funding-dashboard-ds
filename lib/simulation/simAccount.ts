export type SimPositionType = "cross-exchange" | "spot-perp";

export type SimMarketData = {
  symbol: string;
  exchange: string;
  markPrice: number;
  fundingRate: number;
  timestamp: number;
};

export type SimPosition = {
  symbol: string;
  exchange: string;
  type: SimPositionType;
  quantity: number;
  entryPrice: number;
  alphaScore: number;
  entryTime: number;
};

export type SimTrade = {
  symbol: string;
  exchange: string;
  type: SimPositionType;
  alphaScore: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  fundingPnL: number;
  pricePnL: number;
};

export type SimPnL = {
  positionValue: number;
  pricePnL: number;
  fundingPnL: number;
  totalPnL: number;
};

export type SimAccountSnapshot = {
  timestamp: number;
  initialBalance: number;
  currentBalance: number;
  equity: number;
  positionValue: number;
  pricePnL: number;
  fundingPnL: number;
  totalPnL: number;
  positions: SimPosition[];
  tradeHistory: SimTrade[];
};

export type SimAccountState = {
  initialBalance: number;
  currentBalance?: number;
  positions?: SimPosition[];
  tradeHistory?: SimTrade[];
  marketData?: SimMarketData[];
};

export class SimAccount {
  readonly initialBalance: number;
  currentBalance: number;
  positions: SimPosition[];
  tradeHistory: SimTrade[];
  private marketData = new Map<string, SimMarketData>();

  constructor(state: SimAccountState) {
    this.initialBalance = state.initialBalance;
    this.currentBalance = state.currentBalance ?? state.initialBalance;
    this.positions = state.positions?.map((position) => ({ ...position })) ?? [];
    this.tradeHistory = state.tradeHistory?.map((trade) => ({ ...trade })) ?? [];
    for (const market of state.marketData ?? []) {
      this.updateMarket(market);
    }
  }

  updateMarket(market: SimMarketData): void {
    this.marketData.set(getMarketKey(market.symbol, market.exchange), { ...market });
  }

  updateMarkets(markets: SimMarketData[]): void {
    for (const market of markets) {
      this.updateMarket(market);
    }
  }

  openPosition(
    symbol: string,
    exchange: string,
    type: SimPositionType,
    quantity: number,
    alphaScore: number,
    timestamp: number
  ): SimPosition {
    const market = this.getMarket(symbol, exchange);
    const position: SimPosition = {
      symbol,
      exchange,
      type,
      quantity,
      entryPrice: market.markPrice,
      alphaScore,
      entryTime: timestamp
    };

    this.positions.push(position);
    return position;
  }

  closePosition(
    symbol: string,
    exchange: string,
    type: SimPositionType,
    timestamp: number
  ): SimTrade | undefined {
    const index = this.positions.findIndex(
      (position) => position.symbol === symbol && position.exchange === exchange && position.type === type
    );
    if (index === -1) {
      return undefined;
    }

    const [position] = this.positions.splice(index, 1);
    const market = this.getMarket(symbol, exchange);
    const pricePnL = calculatePositionPricePnL(position, market.markPrice);
    const fundingPnL = calculatePositionFundingPnL(position, market.fundingRate, timestamp);
    const trade: SimTrade = {
      symbol,
      exchange,
      type,
      alphaScore: position.alphaScore,
      entryTime: position.entryTime,
      exitTime: timestamp,
      entryPrice: position.entryPrice,
      exitPrice: market.markPrice,
      quantity: position.quantity,
      pricePnL,
      fundingPnL,
      pnl: pricePnL + fundingPnL
    };

    this.tradeHistory.push(trade);
    this.currentBalance += trade.pnl;
    return trade;
  }

  calculatePnL(timestamp = Date.now()): SimPnL {
    return this.positions.reduce<SimPnL>(
      (acc, position) => {
        const market = this.getMarket(position.symbol, position.exchange);
        const pricePnL = calculatePositionPricePnL(position, market.markPrice);
        const fundingPnL = calculatePositionFundingPnL(position, market.fundingRate, timestamp);
        const positionValue = position.quantity * market.markPrice;

        return {
          positionValue: acc.positionValue + positionValue,
          pricePnL: acc.pricePnL + pricePnL,
          fundingPnL: acc.fundingPnL + fundingPnL,
          totalPnL: acc.totalPnL + pricePnL + fundingPnL
        };
      },
      { positionValue: 0, pricePnL: 0, fundingPnL: 0, totalPnL: 0 }
    );
  }

  getAccountSnapshot(timestamp: number): SimAccountSnapshot {
    const pnl = this.calculatePnL(timestamp);

    return {
      timestamp,
      initialBalance: this.initialBalance,
      currentBalance: this.currentBalance,
      equity: this.currentBalance + pnl.totalPnL,
      ...pnl,
      positions: this.positions.map((position) => ({ ...position })),
      tradeHistory: this.tradeHistory.map((trade) => ({ ...trade }))
    };
  }

  toState(): SimAccountState {
    return {
      initialBalance: this.initialBalance,
      currentBalance: this.currentBalance,
      positions: this.positions.map((position) => ({ ...position })),
      tradeHistory: this.tradeHistory.map((trade) => ({ ...trade })),
      marketData: Array.from(this.marketData.values()).map((market) => ({ ...market }))
    };
  }

  hasPosition(symbol: string, exchange: string, type: SimPositionType): boolean {
    return this.positions.some((position) => position.symbol === symbol && position.exchange === exchange && position.type === type);
  }

  private getMarket(symbol: string, exchange: string): SimMarketData {
    const market = this.marketData.get(getMarketKey(symbol, exchange));
    if (!market) {
      throw new Error(`Missing simulation market data for ${exchange}:${symbol}`);
    }

    return market;
  }
}

function calculatePositionPricePnL(position: SimPosition, markPrice: number): number {
  return (markPrice - position.entryPrice) * position.quantity;
}

function calculatePositionFundingPnL(position: SimPosition, fundingRate: number, timestamp: number): number {
  const holdingHours = Math.max(timestamp - position.entryTime, 0) / 60 / 60_000;
  return position.entryPrice * position.quantity * fundingRate * holdingHours;
}

function getMarketKey(symbol: string, exchange: string): string {
  return `${exchange}:${symbol}`;
}
