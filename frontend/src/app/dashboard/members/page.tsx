'use client';

import useSWR from 'swr';
import { api, TeamMember } from '@/lib/api';
import { useState } from 'react';
import clsx from 'clsx';
import { Search, ChevronRight, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import Link from 'next/link';

function ScoreBar({ score, label, color }: { score: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs text-gray-700 w-8 text-right">{Math.round(score)}</span>
    </div>
  );
}

function RiskChip({ score }: { score: number }) {
  if (!score) return <span className="text-xs text-gray-400">No data</span>;
  const level = score >= 85 ? 'critical' : score >= 70 ? 'high' : score >= 50 ? 'moderate' : 'low';
  const styles = {
    critical: 'bg-red-900/10 text-red-700 border-red-200',
    high: 'bg-red-100 text-red-700 border-red-200',
    moderate: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-green-100 text-green-700 border-green-200',
  };
  return (
    <span className={clsx('px-2.5 py-0.5 rounded-full text-xs font-medium border', styles[level])}>
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}

function IntegrationDots({ integrations }: { integrations: Record<string, string> }) {
  const sources = ['google_calendar', 'slack', 'jira'];
  const labels: Record<string, string> = { google_calendar: 'Cal', slack: 'Slack', jira: 'Jira' };

  return (
    <div className="flex gap-1.5">
      {sources.map((s) => (
        <span
          key={s}
          title={`${labels[s]}: ${integrations[s] || 'not connected'}`}
          className={clsx('w-2.5 h-2.5 rounded-full', integrations[s] === 'active' ? 'bg-green-400' : 'bg-gray-200')}
        />
      ))}
    </div>
  );
}

export default function TeamMembersPage() {
  const { data: members, isLoading } = useSWR<TeamMember[]>('team-members', () => api.getTeamMembers());
  const [search, setSearch] = useState('');

  const filtered = members?.filter(
    (m) => m.name?.toLowerCase().includes(search.toLowerCase()) ||
            m.email?.toLowerCase().includes(search.toLowerCase()),
  ) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Members</h1>
          <p className="text-gray-600 text-sm mt-1">
            Last week's health signals — <strong>not</strong> a performance ranking
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 w-56"
          />
        </div>
      </div>

      {/* Privacy reminder */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
        <AlertTriangle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700">
          These scores reflect team health signals, not individual performance. Use them to start
          supportive conversations — not for evaluation. Members can view and delete their own data at any time.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left text-xs font-medium text-gray-500 px-6 py-3 uppercase tracking-wide">Member</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 uppercase tracking-wide">Risk Level</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 uppercase tracking-wide w-48">Signals</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 uppercase tracking-wide">Trend</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 uppercase tracking-wide">Integrations</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((member) => (
              <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt={member.name} className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 text-sm font-medium">
                        {member.name?.[0] || member.email[0]}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-gray-900">{member.name || '—'}</div>
                      <div className="text-xs text-gray-500">{member.email}</div>
                    </div>
                  </div>
                </td>

                <td className="px-4 py-4">
                  <RiskChip score={member.burnout_risk_score} />
                  {member.burnout_risk_score > 0 && (
                    <div className="text-xs text-gray-400 mt-1">{Math.round(member.burnout_risk_score)}/100</div>
                  )}
                </td>

                <td className="px-4 py-4">
                  {member.burnout_risk_score > 0 ? (
                    <div className="space-y-1.5 w-44">
                      <ScoreBar score={member.meeting_load_score} label="Meetings" color="#F59E0B" />
                      <ScoreBar score={100 - member.focus_score} label="Focus gap" color="#EF4444" />
                      <ScoreBar score={member.after_hours_score} label="After hrs" color="#8B5CF6" />
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">No data yet</span>
                  )}
                </td>

                <td className="px-4 py-4">
                  {member.burnout_risk_delta != null ? (
                    <div className={clsx('flex items-center gap-1 text-xs', member.burnout_risk_delta > 0 ? 'text-red-600' : 'text-green-600')}>
                      {member.burnout_risk_delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(Math.round(member.burnout_risk_delta))}pts
                    </div>
                  ) : <span className="text-xs text-gray-400">—</span>}
                </td>

                <td className="px-4 py-4">
                  <IntegrationDots integrations={member.integrations || {}} />
                </td>

                <td className="px-4 py-4 text-right">
                  <Link href={`/dashboard/members/${member.id}`} className="text-brand-500 hover:text-brand-700">
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-500 text-sm">
                  {search ? 'No members found' : 'No members in your team yet'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
