'use client';

import useSWR from 'swr';
import { api, TeamMember } from '@/lib/api';
import { useState } from 'react';
import clsx from 'clsx';
import { Search, ChevronRight, AlertTriangle, TrendingUp, TrendingDown, UserPlus, X, Send } from 'lucide-react';
import Link from 'next/link';

function ScoreBar({ score, label, color }: { score: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs text-slate-700 w-8 text-right">{Math.round(score)}</span>
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

function InviteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.inviteMember(email, role);
      setSent(true);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to send invite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card w-full max-w-md p-7 relative reveal-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-slate-900 [font-family:var(--font-heading)] mb-1">Invite Team Member</h2>
        <p className="text-sm text-slate-500 mb-5">An invite email will be sent with a link to sign in.</p>

        {sent ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Send className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-sm font-medium text-slate-900">Invite sent to <span className="text-blue-700">{email}</span></p>
            <p className="text-xs text-slate-500 mt-1">They'll appear here once they sign in with Google.</p>
            <button onClick={onClose} className="btn-primary mt-4 px-5 py-2 text-sm">Done</button>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
              >
                <option value="member">Member — sees only own data</option>
                <option value="manager">Manager — sees team data</option>
                <option value="admin">Admin — manages org settings</option>
              </select>
            </div>
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700">
                {error.includes('Seat limit') ? (
                  <>
                    {error}{' '}
                    <Link href="/dashboard/settings" className="font-semibold underline">Upgrade plan →</Link>
                  </>
                ) : error}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? 'Sending...' : 'Send Invite'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function TeamMembersPage() {
  const { data: members, isLoading, mutate } = useSWR<TeamMember[]>('team-members', () => api.getTeamMembers());
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);

  const filtered = members?.filter(
    (m) => m.name?.toLowerCase().includes(search.toLowerCase()) ||
            m.email?.toLowerCase().includes(search.toLowerCase()),
  ) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-700 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 reveal-up">
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={() => { mutate(); }}
        />
      )}

      <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/70 p-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 [font-family:var(--font-heading)]">Team Members</h1>
          <p className="text-slate-600 text-sm mt-1">
            Last week's health signals — <strong>not</strong> a performance ranking
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 rounded-xl border border-slate-200 bg-white/80 pl-9 pr-4 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-600"
            />
          </div>
          <button onClick={() => setShowInvite(true)} className="btn-primary gap-2 py-2 px-4 text-sm">
            <UserPlus className="w-4 h-4" />
            Invite
          </button>
        </div>
      </div>

      {/* Privacy reminder */}
      <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
        <AlertTriangle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700">
          These scores reflect team health signals, not individual performance. Use them to start
          supportive conversations — not for evaluation. Members can view and delete their own data at any time.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              <th className="text-left text-xs font-medium text-slate-500 px-6 py-3 uppercase tracking-wide">Member</th>
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 uppercase tracking-wide">Risk Level</th>
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 uppercase tracking-wide w-48">Signals</th>
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 uppercase tracking-wide">Trend</th>
              <th className="text-left text-xs font-medium text-slate-500 px-4 py-3 uppercase tracking-wide">Integrations</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((member) => (
              <tr key={member.id} className={clsx('transition-colors', member.is_active ? 'hover:bg-slate-50/90' : 'bg-slate-50/40 opacity-70')}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt={member.name} className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium', member.is_active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400')}>
                        {(member.name?.[0] || member.email[0]).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{member.name || member.email.split('@')[0]}</span>
                        {!member.is_active && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Invite pending</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{member.email}</div>
                    </div>
                  </div>
                </td>

                <td className="px-4 py-4">
                  {member.is_active ? (
                    <>
                      <RiskChip score={member.burnout_risk_score} />
                      {member.burnout_risk_score > 0 && (
                        <div className="text-xs text-slate-400 mt-1">{Math.round(member.burnout_risk_score)}/100</div>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">Awaiting sign-in</span>
                  )}
                </td>

                <td className="px-4 py-4">
                  {member.is_active && member.burnout_risk_score > 0 ? (
                    <div className="space-y-1.5 w-44">
                      <ScoreBar score={member.meeting_load_score} label="Meetings" color="#F59E0B" />
                      <ScoreBar score={100 - member.focus_score} label="Focus gap" color="#EF4444" />
                      <ScoreBar score={member.after_hours_score} label="After hrs" color="#8B5CF6" />
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">{member.is_active ? 'No data yet' : '—'}</span>
                  )}
                </td>

                <td className="px-4 py-4">
                  {member.is_active && member.burnout_risk_delta != null ? (
                    <div className="space-y-0.5">
                      <div className={clsx('flex items-center gap-1 text-xs', member.burnout_risk_delta > 0 ? 'text-red-600' : 'text-green-600')}>
                        {member.burnout_risk_delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {Math.abs(Math.round(member.burnout_risk_delta))}pts vs last week
                      </div>
                      {(member as any).trajectory === 'escalating' && (
                        <div className="text-xs text-orange-600 font-medium">↑ Escalating trend</div>
                      )}
                      {(member as any).trajectory === 'improving' && (
                        <div className="text-xs text-green-600 font-medium">↓ Improving trend</div>
                      )}
                    </div>
                  ) : <span className="text-xs text-slate-400">—</span>}
                </td>

                <td className="px-4 py-4">
                  {member.is_active ? <IntegrationDots integrations={member.integrations || {}} /> : <span className="text-xs text-slate-400">—</span>}
                </td>

                <td className="px-4 py-4 text-right">
                  {member.is_active && (
                    <Link href={`/dashboard/members/${member.id}`} className="text-blue-700 hover:text-blue-800">
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  )}
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-500 text-sm">
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
