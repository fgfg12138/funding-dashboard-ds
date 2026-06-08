export type ExchangeDirectionInput = {
  longExchange: string;
  shortExchange: string;
  spreadPercent?: number;
};

export type ExchangeDirectionText = {
  direction: string;
  priceSpreadDirection: string;
};

export function formatExchangeDirection({
  longExchange,
  shortExchange,
  spreadPercent
}: ExchangeDirectionInput): ExchangeDirectionText {
  const direction = `空 ${shortExchange} / 多 ${longExchange}`;

  if (spreadPercent === undefined || !Number.isFinite(spreadPercent)) {
    return {
      direction,
      priceSpreadDirection: "-"
    };
  }

  const relation = spreadPercent >= 0 ? "高于" : "低于";

  return {
    direction,
    priceSpreadDirection: `${shortExchange} 标记价格${relation} ${longExchange} ${Math.abs(spreadPercent).toFixed(2)}%`
  };
}
