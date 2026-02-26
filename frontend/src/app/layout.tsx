import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const bodyFont = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
});

const headingFont = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-heading',
  weight: ['500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'FlowPulse — Team Health Analytics',
  description:
    'Privacy-first productivity analytics for engineering teams. Understand meeting load, focus time, and burnout risk — without surveillance.',
  openGraph: {
    title: 'FlowPulse',
    description: 'Engineering team health analytics built on privacy.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${headingFont.variable}`}>
      <body className="ambient-grid text-slate-900 antialiased [font-family:var(--font-body)]">{children}</body>
    </html>
  );
}
