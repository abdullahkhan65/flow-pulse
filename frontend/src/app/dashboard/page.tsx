'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api, TeamDashboard, WeekInProgress } from '@/lib/api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import {
  AlertTriangle, TrendingUp, TrendingDown, Users, Zap, Moon,
  RefreshCw, Calendar, Clock, CheckCircle2, Ticket,
} from 'lucide-react';
import clsx from 'clsx';

function RiskBadge({ score }: { score: number }) {
  const level = score >= 85 ? 'critical' : score >= 70 ? 'high' : score >= 50 ? 'moderate' : 'low';
  const styles = {
    critical: 'bg-rose-700 text-white',
    high: 'bg-rose-100 text-rose-800',
    moderate: 'bg-amber-100 text-amber-800',
    low: 'bg-emerald-100 text-emerald-800',
  };
  return (
    <span className={clsx('badge', styles[level])}>
      {level.charAt(0).toUpperCase() + level.slice(1)} Risk
    </span>
  );
}

function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-200/80 bg-white/60 p-3">
      <div className="relative w-24 h-24">
        <svg className="transform -rotate-90 w-24 h-24">
          <circle cx="48" cy="48" r="36" fill="none" stroke="#E5E7EB" strokeWidth="8" />
          <circle
            cx="48" cy="48" r="36" fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-semibold text-slate-900 [font-family:var(--font-heading)]">{Math.round(score)}</span>
        </div>
      </div>
      <span className="mt-2 text-xs text-slate-600">{label}</span>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, trend }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: any;
  trend?: { delta: number; label: string };
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-slate-600">{title}</p>
        {Icon && <Icon className="w-4 h-4 text-slate-400" />}
      </div>
      <div className="text-2xl font-semibold text-slate-900 [font-family:var(--font-heading)]">{value}</div>
      {subtitle && <div className="text-sm text-slate-500 mt-1">{subtitle}</div>}
      {trend && (
        <div className={clsx('flex items-center gap-1 mt-2 text-xs', trend.delta > 0 ? 'text-red-600' : 'text-green-600')}>
          {trend.delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {Math.abs(trend.delta)}pts {trend.label}
        </div>
      )}
    </div>
  );
}

function AnomalyAlert({ anomaly }: { anomaly: any }) {
  const styles = {
    critical: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  return (
    <div className={clsx('rounded-xl border p-4 flex items-start gap-3', styles[anomaly.severity as keyof typeof styles])}>
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-sm font-medium">{anomaly.message}</p>
      </div>
    </div>
  );
}

function WeekInProgressCard({ wip }: { wip: WeekInProgress }) {
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const stats = [
    {
      label: 'Avg daily meetings',
      value: `${wip.avgDailyMeetingMinutes}m`,
      icon: Calendar,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: 'Avg focus time/day',
      value: `${wip.avgDailyFocusMinutes}m`,
      icon: Zap,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'After-hours events',
      value: wip.totalAfterHoursEvents,
      icon: Moon,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      label: 'Back-to-back meetings',
      value: wip.totalBackToBack,
      icon: Clock,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    ...(wip.totalJiraTransitions > 0 ? [{
      label: 'Tickets completed',
      value: wip.totalJiraCompleted,
      icon: CheckCircle2,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    }] : []),
  ];

  return (
    <div className="card p-6 border-l-4 border-blue-600">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">This Week So Far</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {wip.membersWithData} member{wip.membersWithData !== 1 ? 's' : ''} with data
            · {wip.daysCollected} day{wip.daysCollected !== 1 ? 's' : ''} collected
          </p>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className={clsx(
                'w-5 h-5 rounded-sm text-[9px] font-medium flex items-center justify-center',
                i < wip.daysCollected
                  ? 'bg-blue-700 text-white'
                  : 'bg-slate-100 text-slate-400',
              )}
            >
              {dayNames[i]}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className={clsx('rounded-xl p-3', s.bg)}>
            <s.icon className={clsx('w-4 h-4 mb-2', s.color)} />
            <div className={clsx('text-xl font-semibold [font-family:var(--font-heading)]', s.color)}>{s.value}</div>
            <div className="text-xs text-slate-600 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 mt-4">
        Weekly scores publish Monday morning after 7 days of data.
      </p>
    </div>
  );
}

export default function TeamDashboardPage() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, error, mutate } = useSWR<TeamDashboard>(
    'team-dashboard',
    () => api.getTeamDashboard(4),
    { revalidateOnFocus: false },
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await mutate();
    } finally {
      setRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-700 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-8 text-center text-red-600">
        Failed to load dashboard data. Please refresh.
      </div>
    );
  }

  const latest = data?.latestWeek;
  const trend = data?.trend || [];
  const chartData = [...trend].reverse().map((t) => ({
    week: format(parseISO(t.weekStart), 'MMM d'),
    'Burnout Risk': Math.round(t.burnoutRisk),
    'Meeting Load': Math.round(t.meetingLoad),
    'Focus Score': Math.round(t.focusScore),
  }));

  return (
    <div className="space-y-5 reveal-up">
      {/* Header */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/70 p-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 [font-family:var(--font-heading)]">Team Health Dashboard</h1>
          <p className="text-slate-600 text-sm mt-1">Aggregate team metrics with zero individual ranking.</p>
        </div>
        <div className="flex items-center gap-3">
          {latest && <RiskBadge score={latest.avg_burnout_risk_score} />}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Anomaly alerts */}
      {data?.activeAnomalies && data.activeAnomalies.length > 0 && (
        <div className="space-y-2">
          {data.activeAnomalies.map((a, i) => <AnomalyAlert key={i} anomaly={a} />)}
        </div>
      )}

      {/* Week in progress — shown when current week has data but no completed week yet */}
      {data?.weekInProgress && (
        <WeekInProgressCard wip={data.weekInProgress} />
      )}

      {/* Score rings — completed week */}
      {latest && (
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-6">Last Week Team Averages</h2>
          <div className="flex justify-around flex-wrap gap-6">
            <ScoreRing score={latest.avg_burnout_risk_score} label="Burnout Risk" color="#EF4444" />
            <ScoreRing score={latest.avg_meeting_load_score} label="Meeting Load" color="#F59E0B" />
            <ScoreRing score={latest.avg_focus_score} label="Focus Time" color="#10B981" />
            <ScoreRing score={latest.avg_context_switch_score} label="Context Switch" color="#8B5CF6" />
            <ScoreRing score={latest.avg_slack_interrupt_score} label="Slack Interrupts" color="#3B82F6" />
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Members at Risk"
          value={latest ? `${latest.members_at_risk} / ${latest.total_members}` : '—'}
          subtitle="Burnout risk ≥ 70"
          icon={Users}
        />
        {data?.weekInProgress && data.weekInProgress.totalJiraTransitions > 0 && (
          <StatCard
            title="Tickets Completed"
            value={data.weekInProgress.totalJiraCompleted}
            subtitle={data.weekInProgress.totalJiraAfterHours > 0 ? `${data.weekInProgress.totalJiraAfterHours} after-hours` : 'This week so far'}
            icon={Ticket}
          />
        )}
        <StatCard
          title="Avg Focus Score"
          value={latest ? `${Math.round(latest.avg_focus_score)}/100` : '—'}
          subtitle="Higher is better"
          icon={Zap}
        />
        <StatCard
          title="Avg Meeting Load"
          value={latest ? `${Math.round(latest.avg_meeting_load_score)}/100` : '—'}
          subtitle="Lower is better"
        />
        <StatCard
          title="After-Hours Activity"
          value={latest ? `${Math.round(latest.avg_slack_interrupt_score)}/100` : '—'}
          subtitle="Lower is better"
          icon={Moon}
        />
      </div>

      {/* Trend chart */}
      {chartData.length > 1 && (
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">4-Week Trend</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="burnout" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="focus" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0f766e" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="#0f766e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #cbd5e1', background: 'rgba(255,255,255,0.95)' }} />
              <Area type="monotone" dataKey="Burnout Risk" stroke="#ef4444" fill="url(#burnout)" strokeWidth={2.2} dot={{ r: 3 }} />
              <Area type="monotone" dataKey="Focus Score" stroke="#0f766e" fill="url(#focus)" strokeWidth={2.2} dot={{ r: 3 }} />
              <Area type="monotone" dataKey="Meeting Load" stroke="#f59e0b" fill="none" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Insights */}
      {latest?.insights && latest.insights.length > 0 && (
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Actionable Insights</h2>
          <div className="space-y-4">
            {latest.insights.map((insight: any, i: number) => (
              <div key={i} className="flex items-start gap-3">
                <span className={clsx('badge mt-0.5 flex-shrink-0', {
                  'bg-red-100 text-red-800': insight.priority === 'high',
                  'bg-amber-100 text-amber-800': insight.priority === 'medium',
                  'bg-blue-100 text-blue-800': insight.priority === 'low',
                })}>
                  {insight.priority}
                </span>
                <div>
                  <p className="text-sm text-slate-900">{insight.text}</p>
                  <p className="text-xs text-slate-500 mt-1">{insight.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Integration status */}
      {data?.integrationStatus && data.integrationStatus.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Integration Health</h2>
          <div className="flex gap-4">
            {data.integrationStatus.map((int) => (
              <div key={int.type} className="flex items-center gap-2 text-sm">
                <div className={clsx('w-2 h-2 rounded-full', int.connected > 0 ? 'bg-green-400' : 'bg-gray-300')} />
                <span className="capitalize text-slate-600">{int.type.replace('_', ' ')}</span>
                <span className="text-slate-400">({int.connected} connected)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
