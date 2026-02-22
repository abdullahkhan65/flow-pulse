import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FlowPulse — Team Health Analytics',
  description: 'Privacy-first productivity analytics for engineering teams. Understand meeting load, focus time, and burnout risk — without surveillance.',
  openGraph: {
    title: 'FlowPulse',
    description: 'Engineering team health analytics built on privacy.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
