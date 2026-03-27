'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { api, MemberScores, TeamMember, WeeklyActivity } from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Activity, Flame, CalendarClock, Mail, CheckSquare, GitCommitHorizontal, GitPullRequest, RefreshCw } from 'lucide-react';

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="card p-5">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white [font-family:var(--font-heading)]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      <div className="mt-2 text-slate-400">{icon}</div>
    </div>
  );
}

export default function MemberDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params?.id;
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  const { data: members } = useSWR<TeamMember[]>('team-members', () => api.getTeamMembers());
  const member = useMemo(() => members?.find((m) => m.id === userId), [members, userId]);

  const { data: scores, isLoading, mutate: mutateScores } = useSWR<MemberScores>(
    userId ? `member-scores-${userId}` : null,
    () => api.getMemberScores(userId, 8),
  );

  const onSync = async () => {
    if (!userId) return;
    setSyncing(true);
    setSyncDone(false);
    try {
      await api.syncMemberNow(userId);
      await mutateScores();
      setSyncDone(true);
    } finally {
      setSyncing(false);
    }
  };

  // Build a lookup of weeklyActivity by week_start for merging with weeklyScores
  const activityByWeek = useMemo(() => {
    const map: Record<string, WeeklyActivity> = {};
    for (const a of scores?.weeklyActivity || []) {
      const key = typeof a.week_start === 'string' ? a.week_start.slice(0, 10) : format(a.week_start, 'yyyy-MM-dd');
      map[key] = a;
    }
    return map;
  }, [scores?.weeklyActivity]);

  // Totals from last available week of activity
  const latestActivity = scores?.weeklyActivity?.[0];

  return (
    <div className="space-y-5 reveal-up">
      <div className="panel flex items-center justify-between rounded-2xl p-4">
        <div>
          <h1 className="text-2xl font-semibold text-white [font-family:var(--font-heading)]">{member?.name || 'Member'} Details</h1>
          <p className="mt-1 text-sm text-slate-300">Historical weekly score trend and recent activity breakdown.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onSync}
            disabled={syncing}
            className="btn-secondary px-3 py-2 text-xs"
            title="Re-sync this member's integrations and rebuild their scores"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : syncDone ? 'Synced!' : 'Sync'}
          </button>
          <Link href="/dashboard/members" className="btn-secondary px-3 py-2 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        </div>
      </div>

      {isLoading && <div className="card h-44 animate-pulse bg-white/5" />}

      {/* Risk + load score cards */}
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Burnout Risk"
          value={member ? Math.round(member.burnout_risk_score) : '—'}
          sub="Last full week"
          icon={<Flame className="h-4 w-4" />}
        />
        <StatCard
          label="Meeting Load"
          value={member ? Math.round(member.meeting_load_score) : '—'}
          sub="Last full week"
          icon={<CalendarClock className="h-4 w-4" />}
        />
        <StatCard
          label="Focus Score"
          value={member ? Math.round(member.focus_score) : '—'}
          sub="Higher = more focus"
          icon={<Activity className="h-4 w-4" />}
        />
      </section>

      {/* Raw activity cards */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <CalendarClock className="h-4 w-4 text-amber-500" />
            <p className="text-xs font-medium text-slate-300">Meetings Attended</p>
          </div>
          <p className="text-2xl font-semibold text-white [font-family:var(--font-heading)]">
            {latestActivity ? latestActivity.meeting_count : '—'}
          </p>
          {latestActivity && (
            <p className="text-xs text-slate-400 mt-0.5">{Math.round(latestActivity.total_meeting_minutes / 60 * 10) / 10}h total</p>
          )}
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="h-4 w-4 text-sky-500" />
            <p className="text-xs font-medium text-slate-300">Emails</p>
          </div>
          <p className="text-2xl font-semibold text-white [font-family:var(--font-heading)]">
            {latestActivity ? latestActivity.emails_sent : '—'}
          </p>
          {latestActivity && (
            <p className="text-xs text-slate-400 mt-0.5">{latestActivity.emails_received} received</p>
          )}
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckSquare className="h-4 w-4 text-green-500" />
            <p className="text-xs font-medium text-slate-300">Tasks Completed</p>
          </div>
          <p className="text-2xl font-semibold text-white [font-family:var(--font-heading)]">
            {latestActivity ? latestActivity.tasks_completed : '—'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Jira issues closed</p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <GitCommitHorizontal className="h-4 w-4 text-violet-500" />
            <p className="text-xs font-medium text-slate-300">GitHub</p>
          </div>
          <p className="text-2xl font-semibold text-white [font-family:var(--font-heading)]">
            {latestActivity ? latestActivity.commits : '—'}
          </p>
          {latestActivity && (
            <p className="text-xs text-slate-400 mt-0.5">
              {latestActivity.prs_created} PRs · {latestActivity.pr_reviews} reviews
            </p>
          )}
        </div>
      </section>

      {/* Weekly scores table */}
      <section className="glass-table">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white [font-family:var(--font-heading)]">Weekly Scores</h2>
          <p className="mt-0.5 text-xs text-slate-400">Burnout risk and load scores per completed week</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-400">Week</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">Risk</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">Meetings</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">Focus</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">After-hrs</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {(scores?.weeklyScores || []).map((w) => (
                <tr key={w.week_start} className="transition-colors hover:bg-white/5">
                  <td className="px-5 py-3 font-medium text-white">{format(parseISO(w.week_start), 'MMM d, yyyy')}</td>
                  <td className="px-3 py-3 text-slate-300">{Math.round(w.burnout_risk_score)}</td>
                  <td className="px-3 py-3 text-slate-300">{Math.round(w.meeting_load_score)}</td>
                  <td className="px-3 py-3 text-slate-300">{Math.round(w.focus_score)}</td>
                  <td className="px-3 py-3 text-slate-300">{Math.round(w.after_hours_score)}</td>
                  <td className={`px-3 py-3 font-medium ${(w.burnout_risk_delta || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {(w.burnout_risk_delta || 0) > 0 ? '+' : ''}{Math.round(w.burnout_risk_delta || 0)}
                  </td>
                </tr>
              ))}
              {!scores?.weeklyScores?.length && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">No weekly scores yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Weekly activity breakdown */}
      <section className="glass-table">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-white [font-family:var(--font-heading)]">Weekly Activity Breakdown</h2>
          <p className="mt-0.5 text-xs text-slate-400">Raw counts of meetings, emails, tasks, and GitHub activity per week</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-400">Week</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">
                  <div className="flex items-center gap-1"><CalendarClock className="h-3 w-3 text-amber-500" /> Meetings</div>
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">Mtg hrs</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">
                  <div className="flex items-center gap-1"><Mail className="h-3 w-3 text-sky-500" /> Sent</div>
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">Received</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">
                  <div className="flex items-center gap-1"><CheckSquare className="h-3 w-3 text-green-500" /> Tasks</div>
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">
                  <div className="flex items-center gap-1"><GitCommitHorizontal className="h-3 w-3 text-violet-500" /> Commits</div>
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">
                  <div className="flex items-center gap-1"><GitPullRequest className="h-3 w-3 text-violet-400" /> PRs</div>
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">Reviews</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {(scores?.weeklyActivity || []).map((a) => {
                const weekKey = typeof a.week_start === 'string' ? a.week_start.slice(0, 10) : format(a.week_start, 'yyyy-MM-dd');
                return (
                  <tr key={weekKey} className="transition-colors hover:bg-white/5">
                    <td className="px-5 py-3 font-medium text-white">{format(parseISO(weekKey), 'MMM d, yyyy')}</td>
                    <td className="px-3 py-3 text-slate-300">{a.meeting_count}</td>
                    <td className="px-3 py-3 text-slate-400">{Math.round(a.total_meeting_minutes / 60 * 10) / 10}h</td>
                    <td className="px-3 py-3 text-slate-300">{a.emails_sent}</td>
                    <td className="px-3 py-3 text-slate-400">{a.emails_received}</td>
                    <td className="px-3 py-3 text-slate-300">{a.tasks_completed}</td>
                    <td className="px-3 py-3 text-slate-300">{a.commits}</td>
                    <td className="px-3 py-3 text-slate-300">{a.prs_created}</td>
                    <td className="px-3 py-3 text-slate-400">{a.pr_reviews}</td>
                  </tr>
                );
              })}
              {!scores?.weeklyActivity?.length && (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-sm text-slate-500">No activity data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
