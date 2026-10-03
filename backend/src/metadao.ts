import { createHash } from "node:crypto";
import BN from "bn.js";
import { getProposalAddr } from "@metadaoproject/programs/futarchy/v0.6";
import type { Transaction } from "@solana/web3.js";
import type { BackendConfig } from "./config.js";
import type { SolanaGateway } from "./chain.js";
import { InstructionCodec } from "./instructions.js";

export type MetaDaoPrepareRequest = {
  operation: "initialize" | "stake" | "launch" | "finalize";
  payer: string;
  dao: string;
  baseMint: string;
  quoteMint: string;
  squadsProposal: string;
  proposal?: string;
  amount?: string;
};

export class MetaDaoService {
  constructor(private readonly config: BackendConfig, private readonly chain: SolanaGateway) {}

  private group(transaction: Transaction) {
    return transaction.instructions.map(InstructionCodec.fromWeb3);
  }

  async prepare(input: MetaDaoPrepareRequest) {
    const payer = this.chain.publicKey(input.payer);
    const dao = this.chain.publicKey(input.dao);
    const baseMint = this.chain.publicKey(input.baseMint);
    const quoteMint = this.chain.publicKey(input.quoteMint);
    if (!this.config.acceptsUsdcMint(quoteMint.toBase58())) {
      throw new Error("quoteMint must be one of the configured USDC_MINTS");
    }
    const squadsProposal = this.chain.publicKey(input.squadsProposal);
    const proposal = getProposalAddr(this.chain.metaDaoProgramId, squadsProposal)[0];
    if (input.proposal && input.proposal !== proposal.toBase58()) {
      throw new Error("proposal does not match squadsProposal");
    }
    const client = this.chain.metaDaoClient(payer);
    if (input.operation === "initialize") {
      const pdas = client.getProposalPdas(proposal, baseMint, quoteMint, dao);
      const questionId = createHash("sha256").update(`Will ${proposal.toBase58()} pass?/FAIL/PASS`).digest();
      const question = await client.vaultClient.initializeQuestionIx(questionId, proposal, 2).transaction();
      const baseVault = await client.vaultClient.initializeVaultIx(pdas.question, baseMint, 2, payer).transaction();
      const quoteVault = await client.vaultClient.initializeVaultIx(pdas.question, quoteMint, 2, payer).transaction();
      const initialize = await client.initializeProposalIx(squadsProposal, dao, baseMint, quoteMint, pdas.question, payer).instruction();
      return {
        proposal: proposal.toBase58(),
        question: pdas.question.toBase58(),
        transactions: [this.group(question), [...this.group(baseVault), ...this.group(quoteVault)], [InstructionCodec.fromWeb3(initialize)]],
      };
    }
    if (input.operation === "stake") {
      if (!input.amount || !/^\d+$/.test(input.amount) || BigInt(input.amount) <= 0n) {
        throw new Error("amount must be positive base units");
      }
      const tx = await client.stakeToProposalIx({ proposal, dao, baseMint, amount: new BN(input.amount), staker: payer, payer }).transaction();
      return { proposal: proposal.toBase58(), transactions: [this.group(tx)] };
    }
    if (input.operation === "launch") {
      const tx = await client.launchProposalIx({ proposal, dao, baseMint, quoteMint, squadsProposal }).transaction();
      return { proposal: proposal.toBase58(), transactions: [this.group(tx)] };
    }
    if (input.operation === "finalize") {
      const tx = await client.finalizeProposalIx(proposal, squadsProposal, dao, baseMint, quoteMint).transaction();
      return { proposal: proposal.toBase58(), transactions: [this.group(tx)] };
    }
    throw new Error("Unknown operation");
  }
}
