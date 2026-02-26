import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #0055CC 0%, #0C66E4 58%, #4C9AFF 100%)',
          borderRadius: 36,
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', transform: 'translateY(6px)' }}>
          <div style={{ width: 18, height: 64, borderRadius: 12, background: 'rgba(255,255,255,0.95)' }} />
          <div style={{ width: 18, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.82)' }} />
          <div style={{ width: 18, height: 32, borderRadius: 12, background: 'rgba(255,255,255,0.72)' }} />
        </div>
      </div>
    ),
    size,
  );
}
