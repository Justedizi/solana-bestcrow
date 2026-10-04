import type { Metadata } from 'next';
import Link from 'next/link';

import './globals.css';
import { Providers } from './providers';
import WalletControls from './wallet-controls';

export const metadata: Metadata = {
  title: 'Charity Vault',
  description: 'Bare frontend scaffold for Charity Vault.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-950">
        <Providers>
        <header className="border-b border-slate-200">
          <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4" aria-label="Main navigation">
            <div className="flex items-center gap-4">
              <Link href="/" className="font-medium">Charity Vault</Link>
              <div className="flex gap-4 text-sm">
                <Link href="/discover" className="hover:underline">Discover</Link>
                <Link href="/how-it-works" className="hover:underline">How it works</Link>
              </div>
            </div>
            <WalletControls />
          </nav>
        </header>
        <main className="mx-auto min-h-[calc(100vh-7rem)] max-w-5xl px-6 py-12">{children}</main>
        <footer className="border-t border-slate-200 px-6 py-4 text-sm text-slate-600">
          <div className="mx-auto max-w-5xl">Charity Vault</div>
        </footer>
        </Providers>
      </body>
    </html>
  );
}
