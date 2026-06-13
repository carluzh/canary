import { notFound } from "next/navigation";
import { getMarket, MOCK_MARKETS } from "@/lib/markets";
import { MarketDetail } from "@/components/market-detail";

export function generateStaticParams() {
  return MOCK_MARKETS.map((m) => ({ id: m.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const m = getMarket(id);
  return { title: m ? `${m.question} · canary` : "Market · canary" };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!getMarket(id)) notFound();
  return <MarketDetail id={id} />;
}
