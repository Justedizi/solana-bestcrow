import { Buffer } from "buffer";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { PreparedTransactions } from "./MarketApiClient";

export class TradeTransactionService {
  private static readonly metaDaoProgram = process.env.NEXT_PUBLIC_META_DAO_PROGRAM_ID || "FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq";
  private static readonly vaultProgram = process.env.NEXT_PUBLIC_CONDITIONAL_VAULT_PROGRAM_ID || "VLTX1ishMBbcX3rdBWGssxawAo1Q2X2qxYFYqiGodVg";
  private static readonly allowedPrograms = new Set([
    TradeTransactionService.metaDaoProgram,
    TradeTransactionService.vaultProgram,
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  ]);

  constructor(
    private readonly connection: Connection,
    private readonly wallet: PublicKey,
    private readonly proposal: string,
    private readonly send: (transaction: Transaction, connection: Connection) => Promise<string>,
  ) {}

  async execute(trade: PreparedTransactions, onProgress: (step: number, total: number, signature: string) => void): Promise<string> {
    if (trade.proposal !== this.proposal || trade.transactions.length === 0 || trade.transactions.length > 2) {
      throw new Error("Unexpected prepared transaction");
    }
    const transactions = trade.transactions.map((instructions) => {
      if (instructions.length === 0 || instructions.length > 5 ||
          !instructions.some((instruction) => instruction.programId === TradeTransactionService.metaDaoProgram ||
            instruction.programId === TradeTransactionService.vaultProgram)) {
        throw new Error("Unexpected prepared instructions");
      }
      const transaction = new Transaction();
      for (const instruction of instructions) {
        if (!TradeTransactionService.allowedPrograms.has(instruction.programId) ||
            instruction.accounts.some((account) => account.isSigner && account.address !== this.wallet.toBase58())) {
          throw new Error("Unexpected program or signer in prepared transaction");
        }
        transaction.add(new TransactionInstruction({
          programId: new PublicKey(instruction.programId),
          keys: instruction.accounts.map((account) => ({
            pubkey: new PublicKey(account.address),
            isSigner: account.isSigner,
            isWritable: account.isWritable,
          })),
          data: Buffer.from(instruction.data, "base64"),
        }));
      }
      return transaction;
    });
    let finalSignature = "";
    for (const [index, transaction] of transactions.entries()) {
      const blockhash = await this.connection.getLatestBlockhash("confirmed");
      transaction.feePayer = this.wallet;
      transaction.recentBlockhash = blockhash.blockhash;
      finalSignature = await this.send(transaction, this.connection);
      await this.connection.confirmTransaction({ signature: finalSignature, ...blockhash }, "confirmed");
      onProgress(index + 1, transactions.length, finalSignature);
    }
    return finalSignature;
  }
}
