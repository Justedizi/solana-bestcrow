import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#f8f7f1',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'linear-gradient(120deg, #9945ff 0%, #14f195 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="34" height="34" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="24" stroke="#08251a" strokeWidth="5" />
              <path d="M20 33 L29 42 L46 23" stroke="#08251a" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#183d33', letterSpacing: -1 }}>
            common ground
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 66, fontWeight: 800, color: '#183d33', lineHeight: 1.05, letterSpacing: -3 }}>
            Charity crowdfunding
          </div>
          <div style={{ fontSize: 66, fontWeight: 500, color: '#9945ff', lineHeight: 1.05, letterSpacing: -3 }}>
            without the middleman.
          </div>
          <div style={{ fontSize: 28, color: '#50685b', marginTop: 12 }}>
            Goal met → funds release. Goal missed → every donor refunded, in one transaction.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 22, fontWeight: 700, color: '#65786c' }}>
          <div style={{ width: 14, height: 14, borderRadius: 999, background: 'linear-gradient(120deg, #9945ff, #14f195)' }} />
          Built on Solana
        </div>
      </div>
    ),
    size,
  );
}
