# Charity Vault frontend

The frontend is currently a minimal Tailwind CSS scaffold. Routes are present as
functional React components with no wallet, campaign, or Solana UI behavior wired
into them yet.

Reusable Solana helpers remain in `app/lib/` for the next implementation pass.
They retry transient Solana HTTP 429 responses and show a dedicated-provider
hint after the retry budget is exhausted.

```bash
npm install
npm run dev
```
