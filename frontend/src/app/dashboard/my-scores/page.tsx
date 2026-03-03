'use client';

import { useEffect, useState, useCallback } from 'react';
import useSWR from 'swr';
import { api, MemberScores, WeeklyScore, PreviewData, TodaySnapshot } from '@/lib/api';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';
import {
  RefreshCw, Info, Clock, Calendar, MessageSquare, Zap,
  Moon, AlertTriangle, Mail, Github,
} from 'lucide-react';

// ─── Sub-components ──────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence, days, needed }: {
  confidence: PreviewData['confidence'];
  days: number;
  needed: number;
}) {
  const styles = {
    none:   'bg-gray-100 text-gray-600',
    low:    'bg-amber-100 text-amber-700',
    medium: 'bg-blue-100 text-blue-700',
    high:   'bg-green-100 text-green-700',
  };
  const labels = {
    none:   'No data yet',
    low:    'Early estimate',
    medium: 'Partial week',
    high:   'Good confidence',
  };
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', styles[confidence])}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {labels[confidence]} · {days}/{needed} days
    </span>
  );
}

function DataFreshnessChip({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  if (!lastSyncedAt) return null;
  const syncDate = new Date(lastSyncedAt);
  const diffMins = Math.floor((Date.now() - syncDate.getTime()) / 60000);
  const label = diffMins < 2 ? 'Just synced' :
                diffMins < 60 ? `${diffMins}m ago` :
                `${Math.floor(diffMins / 60)}h ago`;

  return (
    <span className="flex items-center gap-1 text-xs text-slate-400">
      <Clock className="w-3 h-3" /> {label}
    </span>
  );
}

function TodayCard({ snapshot }: { snapshot: TodaySnapshot }) {
  const stats = [
    {
      icon: Calendar,
      label: 'Meetings today',
      value: snapshot.meetingsToday,
      sub: `${snapshot.meetingMinutesToday}min total`,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      alert: snapshot.meetingMinutesToday > 300,
    },
    {
      icon: Zap,
      label: 'Focus time',
      value: `${Math.round(snapshot.focusMinutesToday / 60 * 10) / 10}h`,
      sub: `${snapshot.focusMinutesToday}min uninterrupted`,
      color: 'text-green-600',
      bg: 'bg-green-50',
      alert: snapshot.focusMinutesToday < 60,
    },
    {
      icon: MessageSquare,
      label: 'Slack messages',
      value: snapshot.slackMessagesToday,
      sub: 'sent today',
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      alert: snapshot.slackMessagesToday > 80,
    },
    {
      icon: Moon,
      label: 'After-hours',
      value: snapshot.afterHoursEventsToday,
      sub: snapshot.backToBackToday > 0 ? `+ ${snapshot.backToBackToday} back-to-back` : 'events',
      color: snapshot.afterHoursEventsToday > 0 ? 'text-amber-600' : 'text-gray-500',
      bg: snapshot.afterHoursEventsToday > 0 ? 'bg-amber-50' : 'bg-gray-50',
      alert: snapshot.afterHoursEventsToday > 2,
    },
    {
      icon: Mail,
      label: 'Emails sent',
      value: snapshot.emailsSentToday,
      sub: `${snapshot.emailsReceivedToday} received`,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      alert: false,
    },
    {
      icon: Github,
      label: 'GitHub events',
      value: snapshot.githubEventsToday,
      sub: 'commits + PR activity',
      color: 'text-slate-700',
      bg: 'bg-slate-100',
      alert: snapshot.githubEventsToday > 25,
    },
  ];

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-700">Today&apos;s Snapshot</h2>
        <span className="text-xs text-slate-400">{format(new Date(), 'EEEE, MMM d')}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className={clsx('rounded-xl border border-white/60 p-4', s.bg)}>
            <div className="flex items-center justify-between mb-2">
              <s.icon className={clsx('w-4 h-4', s.color)} />
              {s.alert && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
            </div>
            <div className={clsx('text-2xl font-semibold [font-family:var(--font-heading)]', s.color)}>{s.value}</div>
            <div className="text-xs text-slate-600 mt-0.5 font-medium">{s.label}</div>
            <div className="text-xs text-slate-400 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekSoFarCard({ data, daysCollected }: {
  data: NonNullable<PreviewData['thisWeekSoFar']>;
  daysCollected: number;
}) {
  const activeJiraTickets = (data.jiraTodoCount ?? 0) + (data.jiraInProgressCount ?? 0);
  const jiraAfterHours = data.jiraAfterHoursTransitions ?? 0;

  const stats = [
    { label: 'Total meetings', value: data.totalMeetings, sub: `${data.totalMeetingMinutes}min total` },
    { label: 'Avg meeting/day', value: `${data.avgMeetingMinutesPerDay}min`, sub: data.backToBackMeetings > 0 ? `${data.backToBackMeetings} back-to-back` : 'no back-to-back' },
    { label: 'Avg focus/day', value: `${data.avgFocusMinutesPerDay}min`, sub: `${data.totalFocusMinutes}min total` },
    { label: 'After-hours events', value: data.afterHoursEvents, sub: data.totalSlackMessages > 0 ? `${data.totalSlackMessages} Slack msgs` : 'events' },
    { label: 'Emails sent', value: data.totalEmailsSent, sub: `${data.totalEmailsReceived} received` },
    {
      label: 'Avg response time',
      value: data.avgEmailResponseMin != null ? `${data.avgEmailResponseMin}min` : '—',
      sub: data.afterHoursEmails > 0 ? `${data.afterHoursEmails} after-hours` : 'no after-hours emails',
    },
    {
      label: 'GitHub activity',
      value: data.totalGithubCommits + data.totalGithubPrReviews + data.totalGithubPrsCreated,
      sub: `${data.totalGithubPrReviews} reviews · ${data.githubAfterHoursEvents} after-hours`,
    },
    ...(activeJiraTickets > 0 || data.jiraIssuesCompleted > 0 ? [{
      label: 'Jira workload',
      value: activeJiraTickets > 0 ? `${activeJiraTickets} active` : `${data.jiraIssuesCompleted} done`,
      sub: [
        data.jiraIssuesCompleted > 0 && `${data.jiraIssuesCompleted} completed`,
        jiraAfterHours > 0 && `${jiraAfterHours} after-hours`,
      ].filter(Boolean).join(' · ') || `${data.jiraTodoCount ?? 0} to-do · ${data.jiraInProgressCount ?? 0} in-progress`,
    }] : []),
  ];

  return (
    <div className="card border-l-4 border-blue-600 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">This Week So Far</h2>
          <p className="text-xs text-slate-400 mt-0.5">Based on {daysCollected} day{daysCollected !== 1 ? 's' : ''} of data</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((item) => (
          <div key={item.label}>
            <div className="text-lg font-semibold text-slate-900 [font-family:var(--font-heading)]">{item.value}</div>
            <div className="text-xs font-medium text-slate-600">{item.label}</div>
            <div className="text-xs text-slate-400">{item.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PartialScoreCard({ label, score, description, color }: {
  label: string;
  score: number;
  description: string;
  color: string;
}) {
  const displayScore = Math.round(score);
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm text-slate-600 leading-tight">{label}</span>
        <span className="ml-2 flex-shrink-0 text-lg font-semibold [font-family:var(--font-heading)]" style={{ color }}>
          {displayScore}
        </span>
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}

function SyncingState({ onDone }: { onDone: (data: PreviewData) => void }) {
  const [phase, setPhase] = useState(0);
  const phases = [
    'Connecting to Google Calendar…',
    'Reading meeting metadata…',
    'Analyzing focus time blocks…',
    'Computing your scores…',
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setPhase((p) => Math.min(p + 1, phases.length - 1));
    }, 1200);

    api.syncNow().then((data) => {
      clearInterval(interval);
      onDone(data);
    }).catch(() => clearInterval(interval));

    return () => clearInterval(interval);
  }, [onDone, phases.length]);

  return (
    <div className="card flex flex-col items-center p-12 text-center">
      <div className="relative w-16 h-16 mb-6">
        <div className="w-16 h-16 border-4 border-blue-100 rounded-full" />
        <div className="absolute inset-0 w-16 h-16 border-4 border-blue-700 border-t-transparent rounded-full animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Calendar className="w-6 h-6 text-blue-700" />
        </div>
      </div>
      <h3 className="mb-2 font-semibold text-slate-900 [font-family:var(--font-heading)]">Syncing your data...</h3>
      <p className="mb-6 max-w-xs text-sm text-slate-500">{phases[phase]}</p>
      <div className="flex gap-1">
        {phases.map((_, i) => (
          <div
            key={i}
            className={clsx(
              'h-1 rounded-full transition-all duration-500',
              i <= phase ? 'w-8 bg-blue-700' : 'w-2 bg-slate-200',
            )}
          />
        ))}
      </div>
    </div>
  );
}

function NoIntegrationState() {
  return (
    <div className="card p-12 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
        <Calendar className="h-8 w-8 text-slate-400" />
      </div>
      <h3 className="mb-2 font-semibold text-slate-900 [font-family:var(--font-heading)]">No integrations connected</h3>
      <p className="mx-auto mb-6 max-w-xs text-sm text-slate-500">
        Connect Google Calendar to start seeing your meeting load, focus time, and work pattern data.
      </p>
      <a href="/dashboard/settings" className="btn-primary inline-flex">
        Connect integrations →
      </a>
    </div>
  );
}

function ScoreCard({ label, score, description, color }: {
  label: string; score: number; description: string; color: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-600">{label}</span>
        <span className="text-xl font-semibold [font-family:var(--font-heading)]" style={{ color }}>{Math.round(score)}</span>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <p className="text-xs text-slate-500">{description}</p>
    </div>
  );
}

function SignalCoverageCard({ coverage }: { coverage: PreviewData['signalCoverage'] }) {
  const chips = [
    { key: 'calendar', label: 'Calendar', data: coverage.calendar, tone: 'bg-sky-50 text-sky-700 border-sky-200' },
    { key: 'email', label: 'Email', data: coverage.email, tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { key: 'github', label: 'GitHub', data: coverage.github, tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  ];

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-slate-700 mb-3">Confidence by Signal</h2>
      <div className="grid md:grid-cols-3 gap-3">
        {chips.map((chip) => (
          <div key={chip.key} className={clsx('rounded-xl border p-3', chip.tone)}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">{chip.label}</span>
              <span className="text-xs">{chip.data.connected ? `${chip.data.coveragePct}%` : 'Not connected'}</span>
            </div>
            <p className="mt-2 text-xs opacity-80">
              {chip.data.totalEvents} events across {chip.data.daysWithData} day{chip.data.daysWithData !== 1 ? 's' : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function MyScoresPage() {
  const [syncing, setSyncing] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [hasTriggeredInitialSync, setHasTriggeredInitialSync] = useState(false);

  const { data: scores, isLoading: scoresLoading } = useSWR<MemberScores>(
    'my-scores',
    () => api.getMyScores(8),
  );

  const { data: preview, isLoading: previewLoading, mutate: mutatePreview } = useSWR<PreviewData>(
    'preview',
    () => api.getPreview(),
    { revalidateOnFocus: false },
  );

  const activePreview = previewData ?? preview;
  const hasWeeklyScores = (scores?.weeklyScores?.length ?? 0) > 0;
  const noIntegrationEver = !scoresLoading && !previewLoading && !hasWeeklyScores && activePreview?.lastSyncedAt === null;

  // On first load: if no preview data at all, trigger a sync automatically
  useEffect(() => {
    if (!previewLoading && !hasTriggeredInitialSync && !hasWeeklyScores && activePreview?.daysCollected === 0 && activePreview?.lastSyncedAt === null) {
      setHasTriggeredInitialSync(true);
      setSyncing(true);
    }
  }, [previewLoading, hasWeeklyScores, activePreview, hasTriggeredInitialSync]);

  const handleManualSync = useCallback(async () => {
    setSyncing(true);
  }, []);

  const handleSyncDone = useCallback((data: PreviewData) => {
    setPreviewData(data);
    setSyncing(false);
    mutatePreview(data, false);
  }, [mutatePreview]);

  const getScoreColor = (score: number) =>
    score >= 75 ? '#EF4444' : score >= 50 ? '#F59E0B' : '#10B981';

  const isLoading = scoresLoading || previewLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-700 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Show syncing animation (auto or manual)
  if (syncing) {
    return (
      <div className="space-y-6 reveal-up">
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 [font-family:var(--font-heading)]">My Scores</h1>
            <p className="mt-1 text-sm text-slate-600">Your personal health signals</p>
          </div>
        </div>
        <SyncingState onDone={handleSyncDone} />
      </div>
    );
  }

  const latest: WeeklyScore | undefined = scores?.weeklyScores[0];
  const chartData = scores?.weeklyScores.slice(0, 6).reverse().map((w) => ({
    week: format(parseISO(w.week_start), 'MMM d'),
    risk: Math.round(w.burnout_risk_score),
    focus: Math.round(w.focus_score),
  })) || [];
  const riskFlags = latest?.score_breakdown?.riskFlags || activePreview?.partialScores?.riskFlags || [];

  return (
    <div className="space-y-5 reveal-up">
      {/* Header */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/70 p-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 [font-family:var(--font-heading)]">My Scores</h1>
          <p className="text-slate-600 text-sm mt-1">Your personal health signals — visible only to you and your manager.</p>
        </div>
        <div className="flex items-center gap-3">
          {activePreview && <DataFreshnessChip lastSyncedAt={activePreview.lastSyncedAt} />}
          <button
            onClick={handleManualSync}
            className="btn-secondary text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* No integrations at all */}
      {noIntegrationEver && <NoIntegrationState />}

      {/* Has data — show everything */}
      {!noIntegrationEver && (
        <>
          {/* Today snapshot — always shown first if available */}
          {activePreview?.todaySnapshot && (
            <TodayCard snapshot={activePreview.todaySnapshot} />
          )}
          {activePreview?.signalCoverage && (
            <SignalCoverageCard coverage={activePreview.signalCoverage} />
          )}

          {/* Partial week view — shown when no completed weekly scores yet */}
          {!hasWeeklyScores && activePreview?.daysCollected !== undefined && (
            <div className="space-y-4">
              {/* Confidence / data collection progress banner */}
              <div className="card p-4 flex items-start gap-3 border-sky-200 bg-sky-50">
                <Info className="w-4 h-4 text-blue-700 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-sky-900">
                      Week in progress
                    </p>
                    <ConfidenceBadge
                      confidence={activePreview.confidence}
                      days={activePreview.daysCollected}
                      needed={activePreview.daysNeededForFull}
                    />
                  </div>
                  <p className="text-xs text-sky-800 mt-1">
                    {activePreview.daysCollected === 0
                      ? 'Your calendar was just synced. Data will appear below after the first day is processed.'
                      : `Scores shown below are estimated from ${activePreview.daysCollected} day${activePreview.daysCollected !== 1 ? 's' : ''} of data. Full scores are computed after 7 days.`}
                  </p>
                  {/* Progress bar */}
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-sky-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-600 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, (activePreview.daysCollected / activePreview.daysNeededForFull) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-sky-700 font-medium">
                      {activePreview.daysNeededForFull - activePreview.daysCollected} day{activePreview.daysNeededForFull - activePreview.daysCollected !== 1 ? 's' : ''} until full scores
                    </span>
                  </div>
                </div>
              </div>

              {/* Week so far stats */}
              {activePreview.thisWeekSoFar && (
                <WeekSoFarCard
                  data={activePreview.thisWeekSoFar}
                  daysCollected={activePreview.daysCollected}
                />
              )}

              {/* Partial score cards */}
              {activePreview.partialScores && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-slate-700">Estimated Scores</h2>
                    <ConfidenceBadge
                      confidence={activePreview.confidence}
                      days={activePreview.daysCollected}
                      needed={activePreview.daysNeededForFull}
                    />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <PartialScoreCard
                      label="Burnout Risk"
                      score={activePreview.partialScores.burnoutRiskScore}
                      description="Composite health signal"
                      color={getScoreColor(activePreview.partialScores.burnoutRiskScore)}
                    />
                    <PartialScoreCard
                      label="Meeting Load"
                      score={activePreview.partialScores.meetingLoadScore}
                      description="Meeting burden vs available hours"
                      color={getScoreColor(activePreview.partialScores.meetingLoadScore)}
                    />
                    <PartialScoreCard
                      label="Focus Time"
                      score={activePreview.partialScores.focusScore}
                      description="Uninterrupted deep-work — higher is better"
                      color={activePreview.partialScores.focusScore >= 60 ? '#10B981' : activePreview.partialScores.focusScore >= 40 ? '#F59E0B' : '#EF4444'}
                    />
                    <PartialScoreCard
                      label="Context Switching"
                      score={activePreview.partialScores.contextSwitchScore}
                      description="Switching between tools and tasks"
                      color={getScoreColor(activePreview.partialScores.contextSwitchScore)}
                    />
                    <PartialScoreCard
                      label="Slack Interrupts"
                      score={activePreview.partialScores.slackInterruptScore}
                      description="Slack volume and distribution"
                      color={getScoreColor(activePreview.partialScores.slackInterruptScore)}
                    />
                    <PartialScoreCard
                      label="After Hours"
                      score={activePreview.partialScores.afterHoursScore}
                      description="Activity outside work hours"
                      color={getScoreColor(activePreview.partialScores.afterHoursScore)}
                    />
                    <PartialScoreCard
                      label="GitHub Load"
                      score={activePreview.partialScores.githubLoadScore}
                      description="Coding and review pressure"
                      color={getScoreColor(activePreview.partialScores.githubLoadScore)}
                    />
                    <PartialScoreCard
                      label="Jira Load"
                      score={activePreview.partialScores.jiraLoadScore}
                      description="After-hours ticket work & task pressure"
                      color={getScoreColor(activePreview.partialScores.jiraLoadScore)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Completed weekly scores — shown once we have history */}
          {hasWeeklyScores && latest && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ScoreCard label="Burnout Risk" score={latest.burnout_risk_score} description="Composite health signal — lower is healthier" color={getScoreColor(latest.burnout_risk_score)} />
                <ScoreCard label="Meeting Load" score={latest.meeting_load_score} description="Time consumed by meetings vs work hours" color={getScoreColor(latest.meeting_load_score)} />
                <ScoreCard label="Focus Time" score={latest.focus_score} description="Uninterrupted deep-work — higher is better" color={latest.focus_score >= 60 ? '#10B981' : latest.focus_score >= 40 ? '#F59E0B' : '#EF4444'} />
                <ScoreCard label="Context Switching" score={latest.context_switch_score} description="Switching between tools and tasks" color={getScoreColor(latest.context_switch_score)} />
                <ScoreCard label="Slack Interrupts" score={latest.slack_interrupt_score} description="Volume and distribution of Slack activity" color={getScoreColor(latest.slack_interrupt_score)} />
                <ScoreCard label="After Hours" score={latest.after_hours_score} description="Activity outside configured work hours" color={getScoreColor(latest.after_hours_score)} />
                <ScoreCard
                  label="GitHub Load"
                  score={latest.score_breakdown?.githubLoad?.score || 0}
                  description="Coding/review pressure including off-hours coding"
                  color={getScoreColor(latest.score_breakdown?.githubLoad?.score || 0)}
                />
                <ScoreCard
                  label="Jira Load"
                  score={latest.score_breakdown?.jiraLoad?.score || 0}
                  description="After-hours ticket work and task-thrashing pressure"
                  color={getScoreColor(latest.score_breakdown?.jiraLoad?.score || 0)}
                />
              </div>

              {/* 6-week trend chart */}
              {chartData.length > 1 && (
                <div className="card p-6">
                  <h2 className="text-sm font-semibold text-slate-700 mb-4">6-Week Trend</h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #cbd5e1', background: 'rgba(255,255,255,0.95)' }}
                        formatter={(v: number, name: string) => [v, name === 'risk' ? 'Burnout Risk' : 'Focus Score']}
                      />
                      <Line type="monotone" dataKey="risk" stroke="#EF4444" strokeWidth={2} dot={{ r: 4, fill: '#EF4444' }} name="risk" />
                      <Line type="monotone" dataKey="focus" stroke="#10B981" strokeWidth={2} dot={{ r: 4, fill: '#10B981' }} name="focus" />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center gap-4 mt-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <div className="w-3 h-0.5 bg-red-400 rounded" /> Burnout Risk
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <div className="w-3 h-0.5 bg-green-400 rounded" /> Focus Score
                    </div>
                  </div>
                </div>
              )}

              {/* Daily breakdown for last 14 days */}
              {scores?.recentDaily && scores.recentDaily.length > 0 && (
                <div className="card p-5">
                  <h2 className="text-sm font-semibold text-slate-700 mb-4">Last 14 Days — Daily Detail</h2>
                  <div className="space-y-2">
                    {scores.recentDaily.slice(0, 7).map((day) => {
                      const focusPct = Math.min(100, (day.solo_focus_minutes / 480) * 100);
                      const meetingPct = Math.min(100, (day.total_meeting_minutes / 480) * 100);
                      return (
                        <div key={day.date} className="flex items-center gap-3">
                          <span className="text-xs text-slate-500 w-16 flex-shrink-0">
                            {format(parseISO(day.date), 'EEE d')}
                          </span>
                          <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden flex">
                            <div className="h-full bg-amber-400 transition-all" style={{ width: `${meetingPct}%` }} title={`${day.total_meeting_minutes}min meetings`} />
                            <div className="h-full bg-green-400 transition-all" style={{ width: `${focusPct}%` }} title={`${day.solo_focus_minutes}min focus`} />
                          </div>
                          <div className="text-xs text-slate-500 w-28 flex-shrink-0 text-right">
                            {day.meeting_count}mtg · {day.solo_focus_minutes}m focus
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-4 mt-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <div className="w-3 h-3 bg-amber-400 rounded-sm" /> Meetings
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <div className="w-3 h-3 bg-green-400 rounded-sm" /> Focus time
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Risk flags — shown for both partial and full scores */}
          {riskFlags.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-700">
                {hasWeeklyScores ? "What's driving your score" : 'Early signals — based on data so far'}
              </h2>
              {riskFlags.map((flag: string, i: number) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <Info className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-amber-800">{flag}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
