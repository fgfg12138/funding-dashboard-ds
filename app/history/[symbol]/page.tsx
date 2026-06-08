import HistoryClient from "./HistoryClient";

type HistoryPageProps = {
  params: Promise<{
    symbol: string;
  }>;
};

export default async function HistoryPage({ params }: HistoryPageProps) {
  const { symbol } = await params;
  const decodedSymbol = decodeURIComponent(symbol).replace(/_/g, "/");

  return <HistoryClient symbol={decodedSymbol} />;
}
