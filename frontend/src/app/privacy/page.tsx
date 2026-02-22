import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy & Data Transparency — FlowPulse',
  description: 'Exactly what data FlowPulse collects, stores, and never touches. No surprises.',
};

function Table({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 font-medium text-gray-600">Data point</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">What we store</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">What we NEVER store</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(([point, store, never], i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{point}</td>
              <td className="px-4 py-3 text-green-700">{store}</td>
              <td className="px-4 py-3 text-red-600">{never}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-xl font-bold text-gray-900 mb-4">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  const tableRows: [string, string, string][] = [
    ['Calendar events', 'Duration, participant count, time of day', 'Meeting title, attendee names, video links, descriptions'],
    ['Slack messages', 'Timestamp, channel ID (hashed)', 'Message content, reactions, DMs, file contents, user names'],
    ['Jira tickets', 'Status transition timestamp, issue type', 'Ticket title, description, comments, assignee'],
    ['User profile', 'Email, name, avatar URL, timezone', 'Password, browsing activity, location'],
    ['Scores', 'Weekly computed scores (0–100)', 'Score compared to other individuals, ranking'],
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur z-10">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">FP</span>
            </div>
            <span className="font-bold text-gray-900 text-sm">FlowPulse</span>
          </Link>
          <Link href="/login" className="btn-primary text-sm">Get Started</Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16 space-y-12">
        {/* Header */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-sm border border-green-200 mb-6">
            🔒 Data Transparency Page
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Exactly what we collect.
            <br />
            <span className="text-brand-500">No surprises. Ever.</span>
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed">
            FlowPulse is built on a premise: you can understand team health without reading a single message.
            This page tells you exactly what we store, why, and how you control it.
          </p>
          <p className="text-sm text-gray-400 mt-3">Last updated: January 2025</p>
        </div>

        {/* TL;DR */}
        <div className="bg-gray-900 text-white rounded-xl p-6">
          <h2 className="font-semibold text-lg mb-4">TL;DR — The short version</h2>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            {[
              '✅ We store metadata: timestamps, counts, durations',
              '✅ You can export all your data in one click',
              '✅ You can delete all your data in one click',
              '✅ Team scores are aggregate — no individual ranking',
              '❌ We never read message content',
              '❌ We never store meeting titles or attendee names',
              '❌ We never sell data to third parties',
              '❌ We never use your data for advertising',
            ].map((item, i) => (
              <div key={i} className="text-gray-300">{item}</div>
            ))}
          </div>
        </div>

        {/* Detailed data table */}
        <Section id="what-we-collect" title="What we collect — source by source">
          <p className="text-gray-600 mb-4">
            Every field we store is listed below. This is not a legal document — it is a plain-English
            explanation of our database schema.
          </p>
          <Table rows={tableRows} />
        </Section>

        {/* Why we collect */}
        <Section id="why" title="Why we collect what we collect">
          <div className="space-y-4 text-gray-700 leading-relaxed">
            <p>
              <strong>Meeting duration and participant count:</strong> To compute meeting load score.
              We need to know how much of the work day is consumed by meetings. We don't need titles.
            </p>
            <p>
              <strong>Slack message timestamps:</strong> To compute Slack interruption patterns. We look at
              how many messages are sent and when — not what was said. Channel IDs are stored hashed.
            </p>
            <p>
              <strong>Jira transition timestamps:</strong> To detect context switching between development
              work and other activities. We don't need ticket content.
            </p>
            <p>
              <strong>After-hours detection:</strong> We compare event timestamps against your configured
              work hours (default 9am–6pm) to surface after-hours patterns.
            </p>
          </div>
        </Section>

        {/* Your rights */}
        <Section id="your-rights" title="Your rights">
          <div className="space-y-3">
            {[
              {
                right: 'Right to access',
                description: 'Download everything we have stored about you as a JSON file. Available in Settings → Export My Data.',
              },
              {
                right: 'Right to erasure (GDPR Article 17)',
                description: 'Delete all your activity logs, aggregates, and scores permanently. Available in Settings → Delete All My Data. Irreversible.',
              },
              {
                right: 'Right to opt out',
                description: 'Disable data collection entirely. When disabled, we immediately stop syncing and purge all existing data. Available in Settings → Data Collection toggle.',
              },
              {
                right: 'Right to correction',
                description: 'Contact us to correct inaccurate data. Most data is computed from integrations — we can re-sync on request.',
              },
            ].map((item, i) => (
              <div key={i} className="card p-4 flex gap-4">
                <div className="w-2 h-2 rounded-full bg-brand-500 mt-2 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-gray-900 text-sm">{item.right}</h3>
                  <p className="text-gray-600 text-sm mt-1">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Data storage */}
        <Section id="storage" title="Data storage and security">
          <div className="space-y-4 text-gray-700 leading-relaxed text-sm">
            <p>
              <strong>Database:</strong> PostgreSQL hosted on Supabase (EU region available). Data is
              encrypted at rest using AES-256.
            </p>
            <p>
              <strong>OAuth tokens:</strong> All Google, Slack, and Jira OAuth tokens are encrypted using
              AES-256-GCM before storage. Keys are managed via environment variables, never stored in the
              database.
            </p>
            <p>
              <strong>Data retention:</strong> Raw activity logs are retained for 90 days. Weekly scores
              are retained for 12 months. You can delete all data at any time.
            </p>
            <p>
              <strong>No third-party analytics:</strong> We do not use Google Analytics, Mixpanel,
              or similar tools on the application. Server access logs are retained for 30 days.
            </p>
            <p>
              <strong>Sub-processors:</strong> Supabase (database), Resend (transactional email),
              Railway/Render (hosting). We do not share data with any advertising or analytics platforms.
            </p>
          </div>
        </Section>

        {/* Manager data access */}
        <Section id="manager-access" title="What managers can see">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-4">
            <p className="font-medium text-amber-900 text-sm mb-2">Important: Manager data access is limited by design</p>
            <p className="text-amber-800 text-sm">
              Managers can see health scores per team member — but FlowPulse is explicitly designed to
              prevent individual performance ranking. Scores are intended to prompt supportive conversations,
              not evaluations.
            </p>
          </div>
          <div className="space-y-3 text-sm text-gray-700">
            <p><strong>Managers can see:</strong> Individual weekly scores (burnout risk, meeting load, focus score), week-over-week trend, integration connection status</p>
            <p><strong>Managers CANNOT see:</strong> Which specific meetings, which Slack channels, which Jira tickets triggered the scores. Raw activity logs are never exposed through the manager dashboard.</p>
            <p><strong>Privacy-by-design choices:</strong> No leaderboard. No percentile ranking. No side-by-side comparison tables ordered by score.</p>
          </div>
        </Section>

        {/* Contact */}
        <Section id="contact" title="Questions or concerns">
          <p className="text-gray-700 mb-4">
            If you have questions about your data, want to request deletion, or have privacy concerns,
            reach out directly:
          </p>
          <div className="card p-4">
            <p className="text-sm text-gray-600">Email: <a href="mailto:privacy@flowpulse.app" className="text-brand-600 hover:underline">privacy@flowpulse.app</a></p>
            <p className="text-sm text-gray-600 mt-1">Response time: Within 48 hours</p>
          </div>
        </Section>

        {/* Footer */}
        <div className="border-t border-gray-100 pt-8 text-center">
          <p className="text-gray-500 text-sm">
            FlowPulse is built by engineers who refused to build surveillance software.
            <br />
            This privacy policy is a living document —{' '}
            <a href="https://github.com/abdullahkhan65/flow-pulse" className="text-brand-600 hover:underline">
              changes are tracked on GitHub
            </a>.
          </p>
          <div className="mt-4">
            <Link href="/" className="text-brand-600 hover:underline text-sm">← Back to home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
