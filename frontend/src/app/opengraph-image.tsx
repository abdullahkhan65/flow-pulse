import { ImageResponse } from 'next/og';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px',
          color: 'white',
          background:
            'radial-gradient(circle at 8% 12%, rgba(125,170,255,0.5), rgba(0,0,0,0) 34%), linear-gradient(145deg, #091E42 0%, #0747A6 55%, #0C66E4 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 58, height: 58, borderRadius: 14, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.32)' }} />
          <div style={{ fontSize: 40, fontWeight: 700 }}>FlowPulse</div>
        </div>

        <div style={{ maxWidth: 980 }}>
          <div style={{ fontSize: 68, lineHeight: 1.05, fontWeight: 700 }}>Team Signal Intelligence</div>
          <div style={{ marginTop: 18, fontSize: 30, opacity: 0.92 }}>
            Privacy-first analytics for workload, focus health, and burnout risk.
          </div>
        </div>

        <div style={{ fontSize: 24, opacity: 0.82 }}>flowpulse.app</div>
      </div>
    ),
    size,
  );
}
