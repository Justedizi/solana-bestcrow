import type { Metadata } from 'next';
import Link from 'next/link';

import { WalletButton } from './wallet-button';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Common Ground — Charity Vault',
  description: 'Transparent crowdfunding on Solana',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header>
            <div className="shell nav">
              <Link href="/" className="logo">
                <b>✳</b> common<span>ground</span>
                <small>/ CHARITY VAULT</small>
              </Link>
              <nav>
                <Link href="/">Discover</Link>
                <Link href="/how-it-works">How it works</Link>
              </nav>
              <div className="nav-actions">
                <Link className="outline" href="/campaign/new">
                  Start a campaign ↗
                </Link>
                <WalletButton />
              </div>
            </div>
          </header>
          <main>{children}</main>
          <footer>
            <div className="shell">
              <b>✳ common ground</b>
              <span>Small acts. Transparent outcomes. Built on Solana.</span>
              <Link href="/how-it-works">The trust model ↗</Link>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
