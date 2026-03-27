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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'FlowPulse — Team Signal Intelligence',
    template: '%s | FlowPulse',
  },
  description:
    'Privacy-first analytics for engineering teams. Track meeting load, focus health, context switching, and burnout risk without reading private content.',
  applicationName: 'FlowPulse',
  keywords: [
    'engineering analytics',
    'team health dashboard',
    'burnout risk detection',
    'focus time analytics',
    'privacy-first analytics',
  ],
  alternates: {
    canonical: '/',
  },
  category: 'technology',
  authors: [{ name: 'FlowPulse Team' }],
  creator: 'FlowPulse',
  publisher: 'FlowPulse',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    title: 'FlowPulse — Team Signal Intelligence',
    description:
      'Make better team decisions with privacy-first signal analytics across calendar, Slack, Jira, and GitHub.',
    url: '/',
    siteName: 'FlowPulse',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FlowPulse — Team Signal Intelligence',
    description:
      'Privacy-first analytics for engineering teams: burnout risk, focus health, and workload visibility.',
    creator: '@flowpulse',
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon?size=32', sizes: '32x32', type: 'image/png' },
      { url: '/icon?size=192', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/icon?size=32'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${headingFont.variable}`}>
      <body className="ambient-grid text-white antialiased [font-family:var(--font-body)]">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="glass-orb glass-orb-cyan left-[-8rem] top-[4rem] h-[22rem] w-[22rem]" />
          <div className="glass-orb glass-orb-mint right-[-5rem] top-[18rem] h-[20rem] w-[20rem]" />
          <div className="glass-orb glass-orb-blue bottom-[-7rem] left-1/3 h-[24rem] w-[24rem]" />
        </div>
        {children}
      </body>
    </html>
  );
}
