'use client';

import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-4xl font-bold text-brand-500">{value}</div>
      <div className="text-gray-600 mt-1 text-sm">{label}</div>
    </div>
  );
}

function Feature({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="card p-6">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function PrivacyPill({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-800 rounded-full text-sm border border-green-200">
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
      {text}
    </span>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">FP</span>
            </div>
            <span className="font-bold text-gray-900">FlowPulse</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-sm text-gray-600 hover:text-gray-900">Privacy</Link>
            <Link href="/login" className="btn-primary">Get Started Free</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-50 text-brand-700 rounded-full text-sm font-medium mb-8 border border-brand-100">
          <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
          For engineering teams — no surveillance, ever
        </div>

        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-6">
          Know when your team is
          <br />
          <span className="text-brand-500">headed toward burnout</span>
          <br />
          before it happens
        </h1>

        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed">
          FlowPulse analyzes meeting load, focus time, and after-hours activity to surface
          team health signals — without reading messages or tracking individuals.
        </p>

        <div className="flex items-center justify-center gap-4 mb-8">
          <a href={`${API_URL}/auth/google`} className="btn-primary text-base px-6 py-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Start with Google — Free
          </a>
          <Link href="#how-it-works" className="btn-secondary text-base px-6 py-3">
            See how it works
          </Link>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <PrivacyPill text="No message content stored" />
          <PrivacyPill text="Metadata only" />
          <PrivacyPill text="GDPR right to erasure" />
          <PrivacyPill text="No individual ranking" />
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-gray-100 py-16">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          <Stat value="4.2h" label="Average meeting time lost per day by engineers" />
          <Stat value="23min" label="Time to refocus after an interruption" />
          <Stat value="67%" label="Developers who skip lunch due to meeting overload" />
          <Stat value="3x" label="Burnout risk with poor meeting hygiene" />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">How FlowPulse Works</h2>
          <p className="text-gray-600 max-w-xl mx-auto">Three integrations. One weekly health score. Zero surveillance.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📅</span>
            </div>
            <h3 className="font-semibold mb-2">Connect Calendar</h3>
            <p className="text-gray-600 text-sm">We read meeting counts, durations, and participant counts. Never titles or attendee names.</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">💬</span>
            </div>
            <h3 className="font-semibold mb-2">Connect Slack</h3>
            <p className="text-gray-600 text-sm">We count message timestamps and channels. Never content. Never reactions. Never DMs read.</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🎯</span>
            </div>
            <h3 className="font-semibold mb-2">Get Insights</h3>
            <p className="text-gray-600 text-sm">Weekly team health scores surface patterns before they become burnout incidents.</p>
          </div>
        </div>

        {/* Score preview */}
        <div className="card p-8 bg-gradient-to-br from-gray-50 to-white">
          <h3 className="font-semibold text-gray-900 mb-6 text-center">Your Weekly Health Dashboard</h3>
          <div className="grid md:grid-cols-5 gap-4">
            {[
              { label: 'Meeting Load', score: 72, color: 'text-amber-500', desc: '4.8h avg/day' },
              { label: 'Focus Time', score: 35, color: 'text-red-500', desc: '1.2h deep work' },
              { label: 'After Hours', score: 45, color: 'text-amber-500', desc: '3 late events' },
              { label: 'Context Switches', score: 60, color: 'text-amber-500', desc: '8.2/day avg' },
              { label: 'Burnout Risk', score: 68, color: 'text-red-500', desc: 'Needs attention' },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <div className={`text-3xl font-bold ${item.color}`}>{item.score}</div>
                <div className="text-xs font-medium text-gray-700 mt-1">{item.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Built for Engineering Managers</h2>
            <p className="text-gray-600">Not performance tracking. Not surveillance. Just team health.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Feature
              icon="🔥"
              title="Burnout Risk Score"
              description="Weighted composite of 5 signals. Flags teams approaching unsustainable patterns before people quit."
            />
            <Feature
              icon="📊"
              title="Meeting Load Analysis"
              description="Track back-to-back meetings, meeting-free blocks, and time reclaimed after meeting audits."
            />
            <Feature
              icon="🎯"
              title="Focus Time Tracking"
              description="Identify how much uninterrupted deep work time your engineers actually have each week."
            />
            <Feature
              icon="🌙"
              title="After-Hours Detection"
              description="Surface after-hours and weekend activity patterns — a leading indicator of unsustainable pace."
            />
            <Feature
              icon="⚡"
              title="Context Switch Score"
              description="Measure how often engineers switch between meetings, Slack, and Jira. Fragmentation kills productivity."
            />
            <Feature
              icon="📧"
              title="Weekly Email Digest"
              description="Monday morning team health report lands in manager inbox before standup. With anomaly alerts."
            />
          </div>
        </div>
      </section>

      {/* Privacy section — critical for adoption */}
      <section className="max-w-4xl mx-auto px-6 py-24">
        <div className="card p-10 border-2 border-green-200 bg-green-50">
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">🔒</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Privacy is not a feature — it is the foundation</h2>
            <p className="text-gray-600 max-w-lg mx-auto">We built FlowPulse on a simple principle: we can understand team health without reading a single message.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {[
              ['We store', 'Meeting duration, count, participant count'],
              ['We store', 'Message timestamp and channel ID (no content)'],
              ['We store', 'Jira status transitions (no ticket content)'],
              ['We NEVER store', 'Message content of any kind'],
              ['We NEVER store', 'Meeting titles or attendee names'],
              ['We NEVER store', 'Individual performance rankings'],
              ['You can', 'Export all data we have on you (one click)'],
              ['You can', 'Delete all your data permanently (one click)'],
            ].map(([label, text], i) => (
              <div key={i} className="flex items-start gap-3">
                <span className={`badge mt-0.5 ${label.includes('NEVER') ? 'bg-red-100 text-red-800' : label.includes('can') ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                  {label}
                </span>
                <span className="text-gray-700 text-sm">{text}</span>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link href="/privacy" className="text-brand-600 font-medium text-sm hover:underline">
              Read our full data transparency page →
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-500 py-20">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Start monitoring team health today</h2>
          <p className="text-brand-100 mb-8">Free forever for teams under 10. No credit card required.</p>
          <a href={`${API_URL}/auth/google`} className="inline-flex items-center gap-2 px-8 py-4 bg-white text-brand-600 rounded-xl font-semibold hover:bg-brand-50 transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google — Free
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-brand-500 rounded flex items-center justify-center">
              <span className="text-white font-bold text-xs">FP</span>
            </div>
            <span>FlowPulse</span>
          </div>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-gray-900">Privacy</Link>
            <a href="mailto:hello@flowpulse.app" className="hover:text-gray-900">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
