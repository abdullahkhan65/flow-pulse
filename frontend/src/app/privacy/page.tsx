import type { Metadata } from 'next';
import Link from 'next/link';
import { FlowPulseLogo } from '@/components/brand-logo';

export const metadata: Metadata = {
  title: 'Privacy & Data Transparency — FlowPulse',
  description: 'Clear explanation of what FlowPulse stores, what it never stores, and what controls users have.',
};

const rows: Array<[string, string, string]> = [
  ['Calendar', 'Durations, participant count, event timing', 'Titles, attendee names, meeting descriptions'],
  ['Slack', 'Message timestamps and channel identifiers', 'Message text, DMs, attachments, reactions'],
  ['Jira', 'Status transition timestamps, issue type', 'Ticket title, description, comments'],
  ['Profiles', 'Name, email, timezone, avatar URL', 'Password, browser history, location tracking'],
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen pb-12">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/20 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5 md:px-8">
          <Link href="/" aria-label="FlowPulse home">
            <FlowPulseLogo />
          </Link>
          <Link href="/login" className="btn-primary px-4 py-2 text-xs">Get Started</Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 py-10 md:px-8 md:py-14">
        <section className="glass-header reveal-up p-7 md:p-10">
          <p className="inline-flex rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">Privacy by default</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight [font-family:var(--font-heading)] md:text-5xl">
            Transparent data handling.
            <br />
            No hidden collection.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-300 md:text-base">
            FlowPulse analyzes only structural activity signals to estimate team health. The platform is intentionally built to avoid reading human content.
          </p>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="card p-6">
            <h2 className="text-lg font-semibold [font-family:var(--font-heading)]">What we do</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li>Store metadata needed for score calculations.</li>
              <li>Allow one-click export of personal data.</li>
              <li>Allow one-click permanent deletion of personal data.</li>
            </ul>
          </div>
          <div className="card p-6">
            <h2 className="text-lg font-semibold [font-family:var(--font-heading)]">What we never do</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li>Read Slack messages or email text.</li>
              <li>Store meeting titles or attendee names.</li>
              <li>Generate individual performance ranking leaderboards.</li>
            </ul>
          </div>
        </section>

        <section className="glass-table mt-6 p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Stored</th>
                <th className="px-4 py-3">Never stored</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([source, stored, never]) => (
                <tr key={source} className="border-t border-white/10">
                  <td className="px-4 py-3 font-medium text-white">{source}</td>
                  <td className="px-4 py-3 text-emerald-100">{stored}</td>
                  <td className="px-4 py-3 text-rose-200">{never}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card mt-6 p-6">
          <h2 className="text-lg font-semibold [font-family:var(--font-heading)]">Your rights</h2>
          <p className="mt-2 text-sm text-slate-300">
            You can access, export, or erase your data anytime from settings. If you disable collection,
            syncing is stopped and existing personal data is removed.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/dashboard/settings" className="btn-secondary px-4 py-2 text-xs">Open settings</Link>
            <a href="mailto:privacy@flowpulse.app" className="btn-primary px-4 py-2 text-xs">Contact privacy team</a>
          </div>
        </section>
      </main>
    </div>
  );
}
