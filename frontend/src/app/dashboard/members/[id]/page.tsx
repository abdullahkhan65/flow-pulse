'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { api, MemberScores, TeamMember } from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Activity, Flame, CalendarClock } from 'lucide-react';

export default function MemberDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params?.id;

  const { data: members } = useSWR<TeamMember[]>('team-members', () => api.getTeamMembers());
  const member = useMemo(() => members?.find((m) => m.id === userId), [members, userId]);

  const { data: scores, isLoading } = useSWR<MemberScores>(
    userId ? `member-scores-${userId}` : null,
    () => api.getMemberScores(userId, 8),
  );

  return (
    <div className="space-y-5 reveal-up">
      <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/70 p-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 [font-family:var(--font-heading)]">{member?.name || 'Member'} Details</h1>
          <p className="text-sm text-slate-600 mt-1">Historical weekly score trend and recent daily activity.</p>
        </div>
        <Link href="/dashboard/members" className="btn-secondary px-3 py-2 text-xs">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>
      </div>

      {isLoading && <div className="card h-44 animate-pulse bg-slate-100" />}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs text-slate-500">Burnout Risk</p>
          <p className="mt-2 text-3xl font-semibold [font-family:var(--font-heading)]">{member ? Math.round(member.burnout_risk_score) : '—'}</p>
          <Flame className="mt-2 h-4 w-4 text-slate-400" />
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-500">Meeting Load</p>
          <p className="mt-2 text-3xl font-semibold [font-family:var(--font-heading)]">{member ? Math.round(member.meeting_load_score) : '—'}</p>
          <CalendarClock className="mt-2 h-4 w-4 text-slate-400" />
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-500">Focus Score</p>
          <p className="mt-2 text-3xl font-semibold [font-family:var(--font-heading)]">{member ? Math.round(member.focus_score) : '—'}</p>
          <Activity className="mt-2 h-4 w-4 text-slate-400" />
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold [font-family:var(--font-heading)]">Weekly Scores</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {(scores?.weeklyScores || []).map((w) => (
            <div key={w.week_start} className="grid gap-2 px-5 py-4 text-sm md:grid-cols-6">
              <div className="font-medium text-slate-800">{format(parseISO(w.week_start), 'MMM d, yyyy')}</div>
              <div className="text-slate-600">Risk: {Math.round(w.burnout_risk_score)}</div>
              <div className="text-slate-600">Meetings: {Math.round(w.meeting_load_score)}</div>
              <div className="text-slate-600">Focus: {Math.round(w.focus_score)}</div>
              <div className="text-slate-600">After-hours: {Math.round(w.after_hours_score)}</div>
              <div className="text-slate-600">Delta: {Math.round(w.burnout_risk_delta || 0)}</div>
            </div>
          ))}
          {!scores?.weeklyScores?.length && <p className="px-5 py-8 text-sm text-slate-500">No weekly scores yet.</p>}
        </div>
      </section>
    </div>
  );
}
