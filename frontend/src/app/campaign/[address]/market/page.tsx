import Link from "next/link";
import { TradePanel } from "@/components/TradePanel";
import { WalletContext } from "@/components/WalletContext";

export default async function MarketPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return (
    <main className="market-shell">
      <Link href="/" className="back-link">← Bestcrow</Link>
      <WalletContext><TradePanel campaign={address} /></WalletContext>
    </main>
  );
}
