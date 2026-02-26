'use client';

import Link from 'next/link';
import { ArrowRight, CalendarRange, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { FlowPulseLogo } from '@/components/brand-logo';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

const metrics = [
  { label: 'Signals tracked weekly', value: '5' },
  { label: 'Data model', value: 'Metadata only' },
  { label: 'Time to onboard', value: '< 3 min' },
];

const features = [
  {
    title: 'Burnout risk early warning',
    body: 'Detect compounding meeting pressure and off-hours patterns before they turn into attrition.',
    icon: Sparkles,
  },
  {
    title: 'Focus-time intelligence',
    body: 'Measure uninterrupted work windows across the team and surface hidden productivity loss.',
    icon: Zap,
  },
  {
    title: 'Privacy by architecture',
    body: 'No message content, no ticket text, no meeting titles. Insights come from activity shape only.',
    icon: ShieldCheck,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen pb-14">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 md:px-8">
          <Link href="/" aria-label="FlowPulse home">
            <FlowPulseLogo />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/blog" className="btn-secondary px-3 py-2 text-xs">Blog</Link>
            <Link href="/privacy" className="btn-secondary px-3 py-2 text-xs">Privacy</Link>
            <Link href="/login" className="btn-primary px-4 py-2 text-xs">Get Started</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pt-10 md:px-8 md:pt-16">
        <section className="hero-glow card reveal-up overflow-hidden p-7 md:p-11">
          <div className="grid items-center gap-10 md:grid-cols-[1.12fr_0.88fr]">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">
                <CalendarRange className="h-3.5 w-3.5" />
                Team health analytics for engineering orgs
              </div>
              <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight [font-family:var(--font-heading)] md:text-6xl">
                Modern team visibility without surveillance overhead.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600 md:text-lg">
                FlowPulse turns calendar, Slack, and Jira activity metadata into clear weekly signals for meeting load,
                focus health, context switching, and burnout risk.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <a href={`${API_URL}/auth/google`} className="btn-primary px-5 py-3 text-sm">
                  Start with Google
                  <ArrowRight className="h-4 w-4" />
                </a>
                <Link href="/dashboard" className="btn-secondary px-5 py-3 text-sm">
                  View dashboard
                </Link>
              </div>
            </div>

            <div className="float-soft rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_42px_rgba(15,118,110,0.14)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Live Pulse Preview</p>
              <div className="mt-5 grid gap-4">
                {[
                  ['Burnout Risk', '68', 'High trend'],
                  ['Focus Capacity', '41', 'Needs attention'],
                  ['Meeting Load', '74', 'Heavy week'],
                ].map(([label, score, note]) => (
                  <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{label}</span>
                      <span className="text-2xl font-semibold [font-family:var(--font-heading)]">{score}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-3 md:grid-cols-3">
          {metrics.map((item, idx) => (
            <div key={item.label} className="card reveal-up p-5" style={{ animationDelay: `${idx * 0.08}s` }}>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{item.label}</p>
              <p className="mt-3 text-2xl font-semibold [font-family:var(--font-heading)]">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {features.map((item, idx) => (
            <article key={item.title} className="card reveal-up p-6" style={{ animationDelay: `${0.15 + idx * 0.07}s` }}>
              <item.icon className="h-5 w-5 text-blue-700" />
              <h2 className="mt-4 text-lg font-semibold [font-family:var(--font-heading)]">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
