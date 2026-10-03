'use client';
import {createClient} from '@solana/kit';
import {solanaRpc} from '@solana/kit-plugin-rpc';
import {walletSigner} from '@solana/kit-plugin-wallet';
import {ClientProvider} from '@solana/react';
const client=createClient().use(walletSigner({chain:'solana:devnet'})).use(solanaRpc({rpcUrl:process.env.NEXT_PUBLIC_SOLANA_RPC_URL||'https://api.devnet.solana.com',transactionConfig:{version:0}}));
export function Providers({children}:{children:React.ReactNode}){return <ClientProvider client={client}>{children}</ClientProvider>}
