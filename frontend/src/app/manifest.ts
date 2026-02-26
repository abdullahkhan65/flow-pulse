import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FlowPulse',
    short_name: 'FlowPulse',
    description:
      'Privacy-first analytics for engineering teams. Understand workload, focus, and burnout risk without surveillance.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F4F5F7',
    theme_color: '#0C66E4',
    lang: 'en',
    icons: [
      {
        src: '/icon?size=192',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon?size=512',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
