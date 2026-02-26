'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api, Integration, Organization, BillingStatus, User } from '@/lib/api';
import clsx from 'clsx';
import { CheckCircle, XCircle, Download, Trash2, CreditCard, Zap, CalendarDays, MessageSquare, BriefcaseBusiness, Github } from 'lucide-react';
import { format, parseISO } from 'date-fns';

function IntegrationGlyph({ type }: { type: string }) {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    google_calendar: {
      label: 'GC',
      className: 'border-sky-200 bg-sky-50 text-sky-700',
      icon: <CalendarDays className="h-4 w-4" />,
    },
    slack: {
      label: 'SL',
      className: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
      icon: <MessageSquare className="h-4 w-4" />,
    },
    jira: {
      label: 'JR',
      className: 'border-indigo-200 bg-indigo-50 text-indigo-700',
      icon: <BriefcaseBusiness className="h-4 w-4" />,
    },
    github: {
      label: 'GH',
      className: 'border-slate-200 bg-slate-50 text-slate-700',
      icon: <Github className="h-4 w-4" />,
    },
  };

  const target = map[type] || map.github;
  return (
    <div className={clsx('flex h-10 w-10 items-center justify-center rounded-lg border', target.className)} title={target.label}>
      {target.icon}
    </div>
  );
}

function IntegrationCard({
  type, label, description, icon, integration, onConnect,
}: {
  type: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  integration?: Integration;
  onConnect: () => void;
}) {
  const isConnected = integration?.status === 'active';
  const isError = integration?.status === 'error';

  return (
    <div className="card flex items-center gap-4 p-5">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-slate-900">{label}</h3>
          {isConnected && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
          {isError && <XCircle className="w-3.5 h-3.5 text-red-500" />}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        {isConnected && integration.last_synced_at && (
          <p className="mt-1 text-xs text-slate-400">
            Last synced {format(parseISO(integration.last_synced_at), 'MMM d, h:mm a')}
          </p>
        )}
        {isError && <p className="text-xs text-red-500 mt-1">{integration.error_message}</p>}
      </div>
      <button
        onClick={onConnect}
        className={clsx(
          'flex-shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
          isConnected
            ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            : 'bg-blue-700 text-white hover:bg-blue-800',
        )}
      >
        {isConnected ? 'Reconnect' : 'Connect'}
      </button>
    </div>
  );
}

function Section({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900 [font-family:var(--font-heading)]">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { data: integrations } = useSWR<Integration[]>(
    'integrations', () => api.getIntegrations(),
  );
  const { data: org } = useSWR<Organization>('org', () => api.getOrg());
  const { data: me } = useSWR<User>('me', () => api.getMe());
  const { data: billing } = useSWR<BillingStatus>(
    'billing-status', () => api.getBillingStatus(),
  );

  const [consent, setConsent] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [billingLoading, setBillingLoading] = useState<'checkout' | 'portal' | null>(null);
  const [githubWindow, setGithubWindow] = useState<number>(14);
  const [githubRepos, setGithubRepos] = useState('');
  const [githubSettingsSaving, setGithubSettingsSaving] = useState(false);

  const getIntegration = (type: string) => integrations?.find((i) => i.type === type);
  const isAdminOrOwner = me?.role === 'owner' || me?.role === 'admin';
  const githubIntegration = getIntegration('github');

  useEffect(() => {
    const sync = githubIntegration?.metadata?.githubSync;
    if (!sync) return;
    setGithubWindow([7, 14, 30].includes(sync.timeWindowDays) ? sync.timeWindowDays : 14);
    setGithubRepos(Array.isArray(sync.repoAllowlist) ? sync.repoAllowlist.join('\n') : '');
  }, [githubIntegration?.metadata]);

  const handleConnect = async (type: string) => {
    if (type === 'google_calendar') {
      window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/google`;
    } else if (type === 'slack') {
      const { url } = await api.connectSlack();
      window.location.href = url;
    } else if (type === 'jira') {
      const { url } = await api.connectJira();
      window.location.href = url;
    } else if (type === 'github') {
      const { url } = await api.connectGithub();
      window.location.href = url;
    }
  };

  const handleUpgrade = async () => {
    setBillingLoading('checkout');
    try {
      const { url } = await api.createCheckoutSession(10);
      window.location.href = url;
    } finally {
      setBillingLoading(null);
    }
  };

  const handleManageBilling = async () => {
    setBillingLoading('portal');
    try {
      const { url } = await api.getBillingPortal();
      window.location.href = url;
    } finally {
      setBillingLoading(null);
    }
  };

  const handleExportData = async () => {
    const data = await api.getMyData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-flowpulse-data.json';
    a.click();
  };

  const handleDeleteData = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    await api.deleteMyData();
    setDeleteConfirm(false);
    alert('All your data has been permanently deleted.');
  };

  const handleConsentChange = async (newConsent: boolean) => {
    setConsent(newConsent);
    await api.updateConsent(newConsent);
  };

  const handleSaveGithubSettings = async () => {
    const repoAllowlist = githubRepos
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      .filter(Boolean);
    setGithubSettingsSaving(true);
    try {
      await api.updateGithubSettings({
        timeWindowDays: githubWindow,
        repoAllowlist,
      });
      alert('GitHub sync settings saved.');
    } finally {
      setGithubSettingsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-8 reveal-up">
      <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4">
        <h1 className="text-2xl font-semibold text-slate-900 [font-family:var(--font-heading)]">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">Manage integrations and your privacy preferences.</p>
      </div>

      {/* Integrations */}
      <Section
        title="Integrations"
        description="Connect your tools to start collecting metadata. We never store content."
      >
        <div className="space-y-3">
          <IntegrationCard
            type="google_calendar"
            label="Google Calendar"
            description="Meeting counts, durations, participant counts. No titles or attendees."
            icon={<IntegrationGlyph type="google_calendar" />}
            integration={getIntegration('google_calendar')}
            onConnect={() => handleConnect('google_calendar')}
          />
          <IntegrationCard
            type="slack"
            label="Slack"
            description="Message timestamps and channel IDs only. No message content whatsoever."
            icon={<IntegrationGlyph type="slack" />}
            integration={getIntegration('slack')}
            onConnect={() => handleConnect('slack')}
          />
          <IntegrationCard
            type="jira"
            label="Jira"
            description="Status transitions and update timestamps. No ticket titles or descriptions."
            icon={<IntegrationGlyph type="jira" />}
            integration={getIntegration('jira')}
            onConnect={() => handleConnect('jira')}
          />
          <IntegrationCard
            type="github"
            label="GitHub"
            description="Commit counts, PR events, and review activity. No repo names, PR titles, or code content."
            icon={<IntegrationGlyph type="github" />}
            integration={getIntegration('github')}
            onConnect={() => handleConnect('github')}
          />
          {githubIntegration?.status === 'active' && (
            <div className="card p-4 space-y-3">
              <div>
                <h4 className="text-sm font-medium text-slate-900">GitHub Sync Controls</h4>
                <p className="mt-0.5 text-xs text-slate-500">Limit sync scope to reduce noisy personal/public activity.</p>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <label className="text-xs text-slate-600">
                  Time window
                  <select
                    value={githubWindow}
                    onChange={(e) => setGithubWindow(parseInt(e.target.value, 10))}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  >
                    <option value={7}>Last 7 days</option>
                    <option value={14}>Last 14 days</option>
                    <option value={30}>Last 30 days</option>
                  </select>
                </label>
                <label className="text-xs text-slate-600">
                  Repo allowlist (owner/repo, one per line)
                  <textarea
                    value={githubRepos}
                    onChange={(e) => setGithubRepos(e.target.value)}
                    rows={4}
                    placeholder={'org/backend\norg/frontend'}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleSaveGithubSettings}
                  disabled={githubSettingsSaving}
                  className="btn-secondary text-xs"
                >
                  {githubSettingsSaving ? 'Saving...' : 'Save GitHub Controls'}
                </button>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Privacy Controls */}
      <Section
        title="Your Privacy"
        description="You are always in control of your data. These settings apply only to you."
      >
        <div className="card divide-y divide-slate-100">
          {/* Data collection consent */}
          <div className="p-4 flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-medium text-slate-900">Data Collection</h4>
              <p className="mt-0.5 text-xs text-slate-500">
                When disabled, we stop collecting data and delete all your existing data immediately.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => handleConsentChange(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-700" />
            </label>
          </div>

          {/* Export data */}
          <div className="p-4 flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-medium text-slate-900">Export My Data</h4>
              <p className="mt-0.5 text-xs text-slate-500">
                Download everything we have stored about you as JSON.
              </p>
            </div>
            <button onClick={handleExportData} className="btn-secondary text-xs">
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>

          {/* Delete data */}
          <div className="p-4 flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-medium text-rose-700">Delete All My Data</h4>
              <p className="mt-0.5 text-xs text-slate-500">
                Permanently deletes all activity logs, daily aggregates, and weekly scores. Cannot be undone.
              </p>
            </div>
            <button
              onClick={handleDeleteData}
              className={clsx(
                'text-xs px-4 py-2 rounded-xl font-medium transition-colors',
                deleteConfirm
                  ? 'bg-rose-700 text-white hover:bg-rose-800'
                  : 'text-rose-700 border border-rose-200 hover:bg-rose-50',
              )}
            >
              <Trash2 className="w-3.5 h-3.5 inline mr-1" />
              {deleteConfirm ? 'Click again to confirm' : 'Delete Data'}
            </button>
          </div>
        </div>
      </Section>

      {/* Org settings */}
      {org && (
        <Section title="Organization" description="Visible to admins only">
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Organization</span>
              <span className="font-medium">{org.name}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Plan</span>
              <span className="font-medium capitalize">{org.plan}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Work Hours</span>
              <span className="font-medium">{org.settings.workdayStart} – {org.settings.workdayEnd}</span>
            </div>
          </div>
        </Section>
      )}

      {/* Plan & Billing — owner/admin only */}
      {isAdminOrOwner && billing && (
        <Section title="Plan & Billing" description="Manage your subscription and seats.">
          <div className="card p-5 space-y-4">
            {/* Status badge row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {billing.status === 'trialing' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800">
                    <Zap className="w-3 h-3" />
                    Trial
                  </span>
                ) : billing.status === 'active' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 border border-green-200 px-3 py-1 text-xs font-semibold text-green-800">
                    <CheckCircle className="w-3 h-3" />
                    Pro
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 border border-red-200 px-3 py-1 text-xs font-semibold text-red-800">
                    <XCircle className="w-3 h-3" />
                    {billing.status.replace('_', ' ')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {billing.status !== 'active' && (
                  <button
                    onClick={handleUpgrade}
                    disabled={billingLoading === 'checkout'}
                    className="btn-primary text-sm px-4 py-2 gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {billingLoading === 'checkout' ? 'Redirecting...' : 'Upgrade Plan'}
                  </button>
                )}
                {billing.status === 'active' && (
                  <button
                    onClick={handleManageBilling}
                    disabled={billingLoading === 'portal'}
                    className="btn-secondary text-sm px-4 py-2 gap-1.5"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    {billingLoading === 'portal' ? 'Redirecting...' : 'Manage Billing'}
                  </button>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <p className="text-xs text-slate-500">Seats used</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {billing.activeSeats}
                  <span className="text-sm font-normal text-slate-400"> / {billing.seats}</span>
                </p>
              </div>
              {billing.status === 'trialing' && billing.daysLeftInTrial != null && (
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                  <p className="text-xs text-amber-700">Trial days left</p>
                  <p className="mt-1 text-lg font-semibold text-amber-900">{billing.daysLeftInTrial}</p>
                </div>
              )}
              {billing.status === 'active' && billing.currentPeriodEnd && (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <p className="text-xs text-slate-500">Renews</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {format(parseISO(billing.currentPeriodEnd), 'MMM d, yyyy')}
                  </p>
                </div>
              )}
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <p className="text-xs text-slate-500">Price</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {billing.status === 'trialing' ? 'Free trial' : `$5 / seat / mo`}
                </p>
              </div>
            </div>

            {billing.cancelAtPeriodEnd && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                Your subscription is set to cancel at the end of the billing period.
              </p>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
