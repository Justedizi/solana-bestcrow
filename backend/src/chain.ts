import { AnchorProvider, type Wallet } from "@coral-xyz/anchor";
import { getBackerDecoder, getCampaignDecoder, type Backer, type Campaign } from "@bestcrow/client";
import { FutarchyClient } from "@metadaoproject/programs/futarchy/v0.6";
import { Connection, PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { BackendConfig } from "./config.js";

export type CampaignRecord = { address: string; account: Campaign };
export type BackerRecord = { address: string; account: Backer };
export type ProposalSnapshot = {
  address: string;
  owner: string;
  state: "draft" | "pending" | "passed" | "failed" | "removed";
  timestampEnqueued: number;
  durationSeconds: number;
  dao: string;
  proposer: string;
  squadsProposal: string;
  isTeamSponsored: boolean;
};

export class SolanaGateway {
  readonly connection: Connection;
  readonly programId: PublicKey;
  readonly metaDaoProgramId: PublicKey;
  readonly conditionalVaultProgramId: PublicKey;

  constructor(readonly config: BackendConfig, connection?: Connection) {
    this.connection = connection ?? new Connection(config.rpcUrl, "confirmed");
    this.programId = new PublicKey(config.stagegateProgramId);
    this.metaDaoProgramId = new PublicKey(config.metaDaoProgramId);
    this.conditionalVaultProgramId = new PublicKey(config.conditionalVaultProgramId);
  }

  publicKey(value: string): PublicKey {
    return new PublicKey(value);
  }

  // The provider is used only to construct or decode MetaDAO instructions and accounts.
  metaDaoClient(payer: PublicKey): FutarchyClient {
    const wallet = {
      publicKey: payer,
      signTransaction: async <T extends Transaction | VersionedTransaction>(_tx: T): Promise<T> => {
        throw new Error("Unsigned preparation never signs transactions");
      },
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(_txs: T[]): Promise<T[]> => {
        throw new Error("Unsigned preparation never signs transactions");
      },
    } as unknown as Wallet;
    return FutarchyClient.createClient({
      provider: new AnchorProvider(this.connection, wallet, { commitment: "confirmed" }),
      futarchyProgramId: this.metaDaoProgramId,
      conditionalVaultProgramId: this.conditionalVaultProgramId,
    });
  }

  async listCampaigns(): Promise<CampaignRecord[]> {
    const accounts = await this.connection.getProgramAccounts(this.programId, { commitment: "confirmed" });
    const decoder = getCampaignDecoder();
    const campaigns: CampaignRecord[] = [];
    for (const item of accounts) {
      try {
        campaigns.push({ address: item.pubkey.toBase58(), account: decoder.decode(item.account.data) });
      } catch {
        // The program also owns Backer and DAO binding accounts.
      }
    }
    return campaigns;
  }

  async getCampaign(address: string): Promise<CampaignRecord | null> {
    const key = this.publicKey(address);
    const info = await this.connection.getAccountInfo(key, "confirmed");
    if (!info) return null;
    if (!info.owner.equals(this.programId)) throw new Error("Account is not owned by Bestcrow v2");
    return { address, account: getCampaignDecoder().decode(info.data) };
  }

  async getBacker(campaignAddress: string, walletAddress: string): Promise<BackerRecord | null> {
    const campaign = this.publicKey(campaignAddress);
    const wallet = this.publicKey(walletAddress);
    const [key] = PublicKey.findProgramAddressSync(
      [Buffer.from("backer"), campaign.toBuffer(), wallet.toBuffer()],
      this.programId,
    );
    const info = await this.connection.getAccountInfo(key, "confirmed");
    if (!info) return null;
    if (!info.owner.equals(this.programId)) throw new Error("Backer receipt has the wrong owner");
    return { address: key.toBase58(), account: getBackerDecoder().decode(info.data) };
  }

  async getProposal(address: string): Promise<ProposalSnapshot> {
    const key = this.publicKey(address);
    const info = await this.connection.getAccountInfo(key, "confirmed");
    if (!info || !info.owner.equals(this.metaDaoProgramId)) {
      throw new Error("MetaDAO proposal is missing or has the wrong owner");
    }
    const proposal = await this.metaDaoClient(PublicKey.default).deserializeProposal(info);
    const state = Object.keys(proposal.state)[0] as ProposalSnapshot["state"];
    return {
      address,
      owner: info.owner.toBase58(),
      state,
      timestampEnqueued: Number(proposal.timestampEnqueued),
      durationSeconds: proposal.durationInSeconds,
      dao: proposal.dao.toBase58(),
      proposer: proposal.proposer.toBase58(),
      squadsProposal: proposal.squadsProposal.toBase58(),
      isTeamSponsored: proposal.isTeamSponsored,
    };
  }
}
