"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { MarketApiClient, type MarketSnapshot } from "@/services/MarketApiClient";
import { TradeTransactionService } from "@/services/TradeTransactionService";

export function TradePanel({ campaign }: { campaign: string }) {
  const api = useMemo(() => new MarketApiClient(campaign), [campaign]);
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<number | undefined>();
  const [side, setSide] = useState<"pass" | "fail">("pass");
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [minReceived, setMinReceived] = useState("");
  const [useExistingConditional, setUseExistingConditional] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading market…");
  const [lastSignature, setLastSignature] = useState("");

  useEffect(() => {
    let active = true;
    api.snapshot(selectedMilestone).then((market) => {
      if (active) {
        setSnapshot(market);
        setMessage("");
      }
    }).catch((error: unknown) => {
      if (active) setMessage(error instanceof Error ? error.message : "Could not load market");
    });
    return () => { active = false; };
  }, [api, selectedMilestone]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot || !publicKey) return;
    setBusy(true);
    setLastSignature("");
    setMessage("Preparing transaction…");
    let splitConfirmed = false;
    try {
      const trade = await api.prepare({
        wallet: publicKey.toBase58(), side, direction, amount, minReceived, useExistingConditional,
      });
      const service = new TradeTransactionService(
        connection, publicKey, snapshot.proposal,
        (transaction, currentConnection) => sendTransaction(transaction, currentConnection),
      );
      const signature = await service.execute(trade, (step, total) => {
        if (direction === "buy" && total === 2 && step === 1) splitConfirmed = true;
        setMessage(`Transaction ${step} of ${total} confirmed.`);
      });
      setMessage("Trade confirmed.");
      setLastSignature(signature);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Trade failed";
      setMessage(splitConfirmed ? `${detail} USDC was split; retry with existing conditional USDC.` : detail);
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    if (!snapshot || !publicKey) return;
    setBusy(true);
    setMessage("Preparing redemption…");
    setLastSignature("");
    try {
      const prepared = await api.redeem(publicKey.toBase58(), snapshot.milestone);
      const service = new TradeTransactionService(
        connection, publicKey, snapshot.proposal,
        (transaction, currentConnection) => sendTransaction(transaction, currentConnection),
      );
      const signature = await service.execute(prepared, (step, total) => {
        setMessage(`Redemption ${step} of ${total} confirmed.`);
      });
      setLastSignature(signature);
      setMessage("Winning conditional tokens redeemed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Redemption failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="trade-card">
      <div className="trade-header">
        <div>
          <p className="eyebrow">MetaDAO decision market</p>
          <h1>Trade Pass / Fail</h1>
        </div>
        <WalletMultiButton />
      </div>
      <p className="muted">Campaign: <code>{campaign}</code></p>
      {snapshot && (
        <div className="market-details">
          <label className="field">Milestone
            <select value={snapshot.milestone} onChange={(event) => setSelectedMilestone(Number(event.target.value))}>
              {Array.from({ length: snapshot.milestoneCount }, (_, index) => (
                <option key={index + 1} value={index + 1}>{index + 1}</option>
              ))}
            </select>
          </label>
          <span>Proposal: <code>{snapshot.proposal}</code></span>
          <span>Status: <strong>{snapshot.proposalState}</strong></span>
          <span>Market deadline: {snapshot.marketDeadline ? new Date(snapshot.marketDeadline * 1000).toLocaleString() : "Not started"}</span>
          <span>Indicative mid price: Pass {snapshot.passMidPrice ?? "—"} / Fail {snapshot.failMidPrice ?? "—"} USDC per project token</span>
        </div>
      )}
      {snapshot && (
        <form onSubmit={submit} className="trade-form">
          <fieldset disabled={busy || !snapshot.tradeOpen}>
            <legend>Market</legend>
            <label><input type="radio" name="side" checked={side === "pass"} onChange={() => setSide("pass")} /> Pass</label>
            <label><input type="radio" name="side" checked={side === "fail"} onChange={() => setSide("fail")} /> Fail</label>
          </fieldset>
          <fieldset disabled={busy || !snapshot.tradeOpen}>
            <legend>Action</legend>
            <label><input type="radio" name="direction" checked={direction === "buy"} onChange={() => setDirection("buy")} /> Buy</label>
            <label><input type="radio" name="direction" checked={direction === "sell"} onChange={() => setDirection("sell")} /> Sell</label>
          </fieldset>
          <label className="field">
            Amount to spend ({direction === "buy" ? useExistingConditional ? "conditional USDC" : "USDC" : "conditional project token"})
            <input type="text" inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="10.00" />
          </label>
          <label className="field">
            Minimum to receive ({direction === "buy" ? "project token" : "USDC"})
            <input type="text" inputMode="decimal" required value={minReceived} onChange={(event) => setMinReceived(event.target.value)} placeholder="1.00" />
          </label>
          {direction === "buy" && (
            <label className="checkbox">
              <input type="checkbox" checked={useExistingConditional} onChange={(event) => setUseExistingConditional(event.target.checked)} />
              Use conditional USDC already in my wallet (skip splitting USDC)
            </label>
          )}
          <p className="muted small">Buy uses two wallet transactions: split USDC into Pass/Fail USDC, then swap on the chosen side. You keep the other conditional USDC token. Set a minimum received amount to limit price slippage.</p>
          <button className="primary" disabled={busy || !snapshot.tradeOpen || !publicKey} type="submit">
            {busy ? "Working…" : !snapshot.tradeOpen ? "Market is closed" : !publicKey ? "Connect wallet to trade" : `${direction === "buy" ? "Buy" : "Sell"} ${side.toUpperCase()}`}
          </button>
        </form>
      )}
      {snapshot?.redeemable && (
        <div className="redeem-box">
          <p>Market resolved. Redeem winning conditional tokens for the underlying project token or USDC.</p>
          <button className="primary" type="button" disabled={busy || !publicKey} onClick={() => void redeem()}>
            {publicKey ? "Redeem winning tokens" : "Connect wallet to redeem"}
          </button>
        </div>
      )}
      {message && <p className="trade-message" role="status">{message}</p>}
      {lastSignature && <p className="muted">Transaction: <code>{lastSignature}</code></p>}
      <p className="muted small">Mid prices are indicative, not executable quotes. The wallet signs directly for MetaDAO transactions. Bestcrow never receives your private key.</p>
    </section>
  );
}
