import { ImageResponse } from 'next/og';

export const size = {
  width: 32,
  height: 32,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(140deg, #0055CC 0%, #0C66E4 55%, #4C9AFF 100%)',
          borderRadius: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
          <div style={{ width: 4, height: 14, borderRadius: 3, background: 'rgba(255,255,255,0.95)' }} />
          <div style={{ width: 4, height: 10, borderRadius: 3, background: 'rgba(255,255,255,0.82)' }} />
          <div style={{ width: 4, height: 7, borderRadius: 3, background: 'rgba(255,255,255,0.72)' }} />
        </div>
      </div>
    ),
    size,
  );
}
