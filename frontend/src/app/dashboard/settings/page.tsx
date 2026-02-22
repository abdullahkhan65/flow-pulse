'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { api, Integration, Organization } from '@/lib/api';
import clsx from 'clsx';
import { CheckCircle, XCircle, AlertCircle, RefreshCw, Download, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

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
    <div className="card p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-gray-900 text-sm">{label}</h3>
          {isConnected && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
          {isError && <XCircle className="w-3.5 h-3.5 text-red-500" />}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        {isConnected && integration.last_synced_at && (
          <p className="text-xs text-gray-400 mt-1">
            Last synced {format(parseISO(integration.last_synced_at), 'MMM d, h:mm a')}
          </p>
        )}
        {isError && <p className="text-xs text-red-500 mt-1">{integration.error_message}</p>}
      </div>
      <button
        onClick={onConnect}
        className={clsx(
          'text-sm font-medium px-4 py-2 rounded-lg transition-colors flex-shrink-0',
          isConnected
            ? 'text-gray-600 bg-gray-100 hover:bg-gray-200'
            : 'text-white bg-brand-500 hover:bg-brand-600',
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
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { data: integrations, mutate: mutateIntegrations } = useSWR<Integration[]>(
    'integrations', () => api.getIntegrations(),
  );
  const { data: org } = useSWR<Organization>('org', () => api.getOrg());

  const [consent, setConsent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const getIntegration = (type: string) => integrations?.find((i) => i.type === type);

  const handleConnect = async (type: string) => {
    if (type === 'google_calendar') {
      window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/google`;
    } else if (type === 'slack') {
      const { url } = await api.connectSlack();
      window.location.href = url;
    } else if (type === 'jira') {
      const { url } = await api.connectJira();
      window.location.href = url;
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

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 text-sm mt-1">Manage integrations and your privacy preferences</p>
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
            icon={<span className="text-xl">📅</span>}
            integration={getIntegration('google_calendar')}
            onConnect={() => handleConnect('google_calendar')}
          />
          <IntegrationCard
            type="slack"
            label="Slack"
            description="Message timestamps and channel IDs only. No message content whatsoever."
            icon={<span className="text-xl">💬</span>}
            integration={getIntegration('slack')}
            onConnect={() => handleConnect('slack')}
          />
          <IntegrationCard
            type="jira"
            label="Jira"
            description="Status transitions and update timestamps. No ticket titles or descriptions."
            icon={<span className="text-xl">🎯</span>}
            integration={getIntegration('jira')}
            onConnect={() => handleConnect('jira')}
          />
        </div>
      </Section>

      {/* Privacy Controls */}
      <Section
        title="Your Privacy"
        description="You are always in control of your data. These settings apply only to you."
      >
        <div className="card divide-y divide-gray-100">
          {/* Data collection consent */}
          <div className="p-4 flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Data Collection</h4>
              <p className="text-xs text-gray-500 mt-0.5">
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
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500" />
            </label>
          </div>

          {/* Export data */}
          <div className="p-4 flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Export My Data</h4>
              <p className="text-xs text-gray-500 mt-0.5">
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
              <h4 className="text-sm font-medium text-red-600">Delete All My Data</h4>
              <p className="text-xs text-gray-500 mt-0.5">
                Permanently deletes all activity logs, daily aggregates, and weekly scores. Cannot be undone.
              </p>
            </div>
            <button
              onClick={handleDeleteData}
              className={clsx(
                'text-xs px-4 py-2 rounded-lg font-medium transition-colors',
                deleteConfirm
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'text-red-600 border border-red-200 hover:bg-red-50',
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
              <span className="text-gray-600">Organization</span>
              <span className="font-medium">{org.name}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Plan</span>
              <span className="font-medium capitalize">{org.plan}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Work Hours</span>
              <span className="font-medium">{org.settings.workdayStart} – {org.settings.workdayEnd}</span>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
