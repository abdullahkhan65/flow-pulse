'use client';

import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';

const steps = ['Welcome', 'Privacy', 'Integrations', 'Sync'];

const syncPhases = [
  'Connecting to Google Calendar...',
  'Reading last 7 days of activity...',
  'Building your baseline...',
  'Computing first scores...',
];

function IntegrationBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <div className={clsx('flex h-10 w-10 items-center justify-center rounded-lg border text-xs font-semibold backdrop-blur-xl', tone)}>
      {label}
    </div>
  );
}

function SyncProgress({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    let p = 0;
    const interval = setInterval(() => {
      p += 1;
      if (p < syncPhases.length) setPhase(p);
      else clearInterval(interval);
    }, 1100);

    api
      .syncNow()
      .then(() => {
        clearInterval(interval);
        setPhase(syncPhases.length - 1);
        setTimeout(onDone, 500);
      })
      .catch(() => {
        clearInterval(interval);
        setTimeout(onDone, 500);
      });

    return () => clearInterval(interval);
  }, [onDone]);

  const pct = Math.round(((phase + 1) / syncPhases.length) * 100);

  return (
    <div className="text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-cyan-200/20 bg-white/10 text-sm font-semibold text-cyan-100 backdrop-blur-xl">
        {pct}%
      </div>
      <h2 className="text-2xl font-semibold [font-family:var(--font-heading)]">Syncing your workspace</h2>
      <p className="mt-2 text-sm text-slate-300">{syncPhases[phase]}</p>
      <div className="mx-auto mt-6 h-2 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-blue-700 to-sky-500 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connected] = useState<string[]>(['google_calendar']);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const router = useRouter();

  const handleConnect = async (type: string) => {
    setConnecting(type);
    try {
      if (type === 'slack') {
        const { url } = await api.connectSlack();
        window.location.href = url;
      } else if (type === 'jira') {
        const { url } = await api.connectJira();
        window.location.href = url;
      }
    } finally {
      setConnecting(null);
    }
  };

  const goToSync = () => {
    setStep(3);
    setSyncing(true);
    setSyncDone(false);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-5 py-10 md:px-8">
      <div className="w-full reveal-up">
        <div className="mb-5 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-white/10 px-3 py-1 text-xs font-semibold text-cyan-100">
            <Sparkles className="h-3.5 w-3.5" />
            Guided setup
          </div>
          <p className="text-xs text-slate-400">Step {step + 1} of {steps.length}</p>
        </div>

        <div className="mb-7 grid grid-cols-4 gap-2">
          {steps.map((label, i) => (
            <div key={label} className={clsx('h-1.5 rounded-full transition-all', i <= step ? 'bg-cyan-300' : 'bg-white/10')} />
          ))}
        </div>

        <div className="glass-header p-6 md:p-8">
          {step === 0 && (
            <div>
              <h1 className="text-3xl font-semibold [font-family:var(--font-heading)] md:text-4xl">Welcome to FlowPulse</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 md:text-base">
                This setup links your tools and establishes your first baseline in a few minutes. You can always adjust data controls later.
              </p>
              <div className="mt-8 flex justify-end">
                <button onClick={() => setStep(1)} className="btn-primary px-5 py-2.5">Continue</button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-2xl font-semibold [font-family:var(--font-heading)]">Privacy commitment</h2>
              <p className="mt-2 text-sm text-slate-300">FlowPulse is intentionally designed for insight without surveillance.</p>
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {[
                  'We use timestamps, durations, and counts',
                  'No message content is ever read or stored',
                  'No meeting titles or attendee names are stored',
                  'No individual ranking leaderboard is generated',
                ].map((item) => (
                  <div key={item} className="panel p-3 text-sm text-slate-200">{item}</div>
                ))}
              </div>
              <div className="mt-8 flex gap-3">
                <button onClick={() => setStep(0)} className="btn-secondary flex-1">Back</button>
                <button onClick={() => setStep(2)} className="btn-primary flex-1">I understand</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-2xl font-semibold [font-family:var(--font-heading)]">Connect integrations</h2>
              <p className="mt-2 text-sm text-slate-300">Calendar is already connected from sign-in. Add Slack and Jira for fuller signal quality.</p>

              <div className="mt-6 space-y-3">
                {[
                  { type: 'google_calendar', label: 'Google Calendar', detail: 'Meeting load and focus windows', required: true, short: 'GC', tone: 'border-cyan-200/25 bg-cyan-200/10 text-cyan-100' },
                  { type: 'slack', label: 'Slack', detail: 'Interruption and after-hours patterns', required: false, short: 'SL', tone: 'border-fuchsia-200/25 bg-fuchsia-200/10 text-fuchsia-100' },
                  { type: 'jira', label: 'Jira', detail: 'Context-switch and workflow friction', required: false, short: 'JR', tone: 'border-indigo-200/25 bg-indigo-200/10 text-indigo-100' },
                ].map((it) => {
                  const isConnected = connected.includes(it.type);
                  return (
                    <div key={it.type} className="panel flex items-center gap-3 p-4">
                      <IntegrationBadge label={it.short} tone={it.tone} />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">{it.label} {it.required && <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-200">Required</span>}</p>
                        <p className="text-xs text-slate-400">{it.detail}</p>
                      </div>
                      {isConnected ? (
                        <span className="text-xs font-semibold text-emerald-200">Connected</span>
                      ) : (
                        <button
                          onClick={() => handleConnect(it.type)}
                          disabled={connecting === it.type}
                          className="btn-primary px-3 py-2 text-xs"
                        >
                          {connecting === it.type ? 'Connecting...' : 'Connect'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 flex gap-3">
                <button onClick={() => setStep(1)} className="btn-secondary flex-1">Back</button>
                <button onClick={goToSync} className="btn-primary flex-1">Continue</button>
              </div>
            </div>
          )}

          {step === 3 && syncing && !syncDone && (
            <SyncProgress onDone={() => { setSyncing(false); setSyncDone(true); }} />
          )}

          {step === 3 && syncDone && (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-200/20 bg-emerald-300/10 text-emerald-100 backdrop-blur-xl">
                <CheckCircle className="h-8 w-8" />
              </div>
              <h2 className="text-3xl font-semibold [font-family:var(--font-heading)]">You are ready</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-slate-300 md:text-base">
                Initial data is synced and your first dashboard is prepared. More confidence builds as additional days are collected.
              </p>
              <button onClick={() => router.push('/dashboard')} className="btn-primary mt-7 w-full py-3">Open dashboard</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
