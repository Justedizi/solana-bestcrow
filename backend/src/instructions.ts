import { AccountRole, address, type Instruction } from "@solana/kit";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";

export type SerializedInstruction = {
  programId: string;
  accounts: Array<{ address: string; isSigner: boolean; isWritable: boolean }>;
  data: string;
};

export class InstructionCodec {
  static readonlySigner(value: string) {
    return {
      address: address(value),
      signTransactions: async () => { throw new Error("Unsigned preparation never signs transactions"); },
    };
  }

  static fromKit(ix: Instruction): SerializedInstruction {
    return {
      programId: ix.programAddress,
      accounts: (ix.accounts ?? []).map((meta) => ({
        address: meta.address,
        isSigner: meta.role >= AccountRole.READONLY_SIGNER,
        isWritable: meta.role === AccountRole.WRITABLE || meta.role === AccountRole.WRITABLE_SIGNER,
      })),
      data: Buffer.from(ix.data ?? []).toString("base64"),
    };
  }

  static fromWeb3(ix: TransactionInstruction): SerializedInstruction {
    return {
      programId: ix.programId.toBase58(),
      accounts: ix.keys.map((meta) => ({
        address: meta.pubkey.toBase58(),
        isSigner: meta.isSigner,
        isWritable: meta.isWritable,
      })),
      data: ix.data.toString("base64"),
    };
  }

  static toWeb3(ix: SerializedInstruction): TransactionInstruction {
    return new TransactionInstruction({
      programId: new PublicKey(ix.programId),
      keys: ix.accounts.map((meta) => ({
        pubkey: new PublicKey(meta.address),
        isSigner: meta.isSigner,
        isWritable: meta.isWritable,
      })),
      data: Buffer.from(ix.data, "base64"),
    });
  }
}
