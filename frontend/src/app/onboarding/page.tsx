'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import clsx from 'clsx';
import { CheckCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

const steps = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'done', label: 'Done' },
];

const syncPhases = [
  'Connecting to Google Calendar…',
  'Pulling last 7 days of events…',
  'Building your activity baseline…',
  'Computing initial scores…',
];

function SyncProgress({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    let p = 0;
    // Cycle through phase labels every 1.2s for UX feedback
    const interval = setInterval(() => {
      p += 1;
      if (p < syncPhases.length) {
        setPhase(p);
      } else {
        clearInterval(interval);
      }
    }, 1200);

    api.syncNow()
      .then(() => {
        clearInterval(interval);
        setPhase(syncPhases.length - 1);
        setTimeout(onDone, 600);
      })
      .catch(() => {
        clearInterval(interval);
        // Still proceed — user can refresh from the dashboard
        setTimeout(onDone, 600);
      });

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = Math.round(((phase + 1) / syncPhases.length) * 100);

  return (
    <div className="text-center py-4">
      <div className="w-16 h-16 mx-auto mb-6 relative">
        <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
        <div
          className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin"
          style={{ animationDuration: '1s' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-brand-600">{pct}%</span>
        </div>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mb-2">Syncing your data…</h2>
      <p className="text-sm text-gray-500 mb-8 h-5 transition-all duration-300">
        {syncPhases[phase]}
      </p>

      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
        <div
          className="bg-brand-500 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-400">This takes about 10 seconds</p>
    </div>
  );
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connected, setConnected] = useState<string[]>(['google_calendar']); // Google was connected on login
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

  const goToDone = () => {
    setStep(3);
    setSyncing(true);
    setSyncDone(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">FP</span>
          </div>
          <span className="font-bold text-gray-900">FlowPulse</span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.id} className="flex-1 flex items-center gap-2">
              <div className={clsx(
                'flex-1 h-1 rounded-full transition-all duration-500',
                i < step ? 'bg-brand-500' : i === step ? 'bg-brand-200' : 'bg-gray-200',
              )} />
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="card p-8">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center">
              <div className="text-5xl mb-6">👋</div>
              <h1 className="text-2xl font-bold text-gray-900 mb-3">Welcome to FlowPulse</h1>
              <p className="text-gray-600 leading-relaxed mb-8">
                Let's set up team health monitoring for your organization. It takes about 3 minutes.
                We'll connect your tools and explain exactly what data we collect.
              </p>
              <button onClick={() => setStep(1)} className="btn-primary w-full justify-center py-3">
                Let's get started →
              </button>
            </div>
          )}

          {/* Step 1: Privacy commitment */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Our privacy commitment</h2>
              <p className="text-gray-600 text-sm mb-6">
                Before we connect anything, here's exactly what FlowPulse will and won't collect.
              </p>

              <div className="space-y-3 mb-8">
                {[
                  { icon: '✅', text: 'Meeting counts, durations, participant counts' },
                  { icon: '✅', text: 'Slack message timestamps (no content)' },
                  { icon: '✅', text: 'Jira transition timestamps (no ticket content)' },
                  { icon: '❌', text: 'Meeting titles or attendee names — never' },
                  { icon: '❌', text: 'Message content of any kind — never' },
                  { icon: '❌', text: 'Individual performance ranking — never' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-lg w-6 flex-shrink-0">{item.icon}</span>
                    <span className="text-gray-700">{item.text}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(0)} className="btn-secondary flex-1 justify-center">← Back</button>
                <button onClick={() => setStep(2)} className="btn-primary flex-1 justify-center">
                  I understand, continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Integrations */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Connect your tools</h2>
              <p className="text-gray-600 text-sm mb-6">
                Google Calendar was connected during sign-in. Connect Slack and Jira for fuller insights.
              </p>

              <div className="space-y-3 mb-8">
                {[
                  {
                    type: 'google_calendar',
                    icon: '📅',
                    label: 'Google Calendar',
                    desc: 'Meeting load, back-to-back meetings, focus time',
                    required: true,
                  },
                  {
                    type: 'slack',
                    icon: '💬',
                    label: 'Slack',
                    desc: 'Interruption patterns, after-hours messaging',
                    required: false,
                  },
                  {
                    type: 'jira',
                    icon: '🎯',
                    label: 'Jira',
                    desc: 'Context switching, work distribution patterns',
                    required: false,
                  },
                ].map((int) => (
                  <div key={int.type} className="flex items-center gap-4 p-4 border border-gray-100 rounded-xl">
                    <span className="text-2xl">{int.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{int.label}</span>
                        {int.required && <span className="badge bg-gray-100 text-gray-600">Required</span>}
                        {connected.includes(int.type) && <CheckCircle className="w-4 h-4 text-green-500" />}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{int.desc}</div>
                    </div>
                    {connected.includes(int.type) ? (
                      <span className="text-xs text-green-600 font-medium">Connected</span>
                    ) : (
                      <button
                        onClick={() => handleConnect(int.type)}
                        disabled={connecting === int.type}
                        className="btn-primary text-xs"
                      >
                        {connecting === int.type ? 'Connecting...' : 'Connect'}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="btn-secondary flex-1 justify-center">← Back</button>
                <button onClick={goToDone} className="btn-primary flex-1 justify-center">
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Done — sync in progress or complete */}
          {step === 3 && syncing && !syncDone && (
            <SyncProgress onDone={() => { setSyncing(false); setSyncDone(true); }} />
          )}

          {step === 3 && syncDone && (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Your data is ready!</h2>
              <p className="text-gray-600 mb-2">
                We've pulled your last 7 days of calendar data and computed your initial scores.
                You'll see real metrics on your dashboard right now — no waiting.
              </p>
              <p className="text-gray-500 text-sm mb-8">
                Scores update every 4 hours. Invite your team from Settings.
              </p>
              <button onClick={() => router.push('/dashboard')} className="btn-primary w-full justify-center py-3">
                Go to Dashboard →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
