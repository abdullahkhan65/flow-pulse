'use client';

import useSWR from 'swr';
import { api, TeamMember, User } from '@/lib/api';
import { useState } from 'react';
import clsx from 'clsx';
import { Search, ChevronRight, AlertTriangle, TrendingUp, TrendingDown, UserPlus, X, Send, Trash2, RotateCcw, CalendarDays, Mail, CheckSquare, GitCommitHorizontal, RefreshCw } from 'lucide-react';
import Link from 'next/link';

function ScoreBar({ score, label, color }: { score: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 flex-shrink-0 text-xs text-slate-400">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-8 text-right text-xs text-slate-200">{Math.round(score)}</span>
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

function ActivityStats({ member }: { member: TeamMember }) {
  const hasAny =
    member.meetings_this_week > 0 ||
    member.emails_sent_this_week > 0 ||
    member.tasks_completed_this_week > 0 ||
    member.commits_this_week > 0;

  if (!hasAny) return <span className="text-xs text-slate-400">No data</span>;

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
      {member.meetings_this_week > 0 && (
        <div className="flex items-center gap-1 text-xs text-slate-300">
          <CalendarDays className="w-3 h-3 text-amber-500 flex-shrink-0" />
          <span>{member.meetings_this_week} mtgs</span>
        </div>
      )}
      {(member.emails_sent_this_week > 0 || member.emails_received_this_week > 0) && (
        <div className="flex items-center gap-1 text-xs text-slate-300">
          <Mail className="w-3 h-3 text-sky-500 flex-shrink-0" />
          <span>{member.emails_sent_this_week}/{member.emails_received_this_week}</span>
        </div>
      )}
      {member.tasks_completed_this_week > 0 && (
        <div className="flex items-center gap-1 text-xs text-slate-300">
          <CheckSquare className="w-3 h-3 text-green-500 flex-shrink-0" />
          <span>{member.tasks_completed_this_week} tasks</span>
        </div>
      )}
      {member.commits_this_week > 0 && (
        <div className="flex items-center gap-1 text-xs text-slate-300">
          <GitCommitHorizontal className="w-3 h-3 text-violet-500 flex-shrink-0" />
          <span>{member.commits_this_week} commits</span>
        </div>
      )}
    </div>
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
      <div className="glass-header relative w-full max-w-md p-7 reveal-up">
        <button onClick={onClose} className="absolute right-4 top-4 text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h2 className="mb-1 text-lg font-semibold text-white [font-family:var(--font-heading)]">Invite Team Member</h2>
        <p className="mb-5 text-sm text-slate-400">An invite email will be sent with a link to sign in.</p>

        {sent ? (
          <div className="text-center py-4">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-300/10">
              <Send className="w-5 h-5 text-emerald-200" />
            </div>
            <p className="text-sm font-medium text-white">Invite sent to <span className="text-cyan-200">{email}</span></p>
            <p className="mt-1 text-xs text-slate-400">They'll appear here once they sign in with Google.</p>
            <button onClick={onClose} className="btn-primary mt-4 px-5 py-2 text-sm">Done</button>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="input rounded-xl"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="input rounded-xl"
              >
                <option value="member">Member — sees only own data</option>
                <option value="manager">Manager — sees team data</option>
                <option value="admin">Admin — manages org settings</option>
              </select>
            </div>
            {error && (
              <div className="rounded-xl border border-red-200/20 bg-red-300/10 px-3.5 py-2.5 text-sm text-red-100">
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
  const { data: me } = useSWR<User>('me', () => api.getMe());
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; failed: number } | null>(null);

  const filtered = members?.filter(
    (m) => m.name?.toLowerCase().includes(search.toLowerCase()) ||
            m.email?.toLowerCase().includes(search.toLowerCase()),
  ) || [];
  const activeCount = members?.filter((m) => m.is_active).length || 0;
  const pendingCount = members?.filter((m) => !m.is_active).length || 0;
  const isAdmin = me && ['owner', 'admin'].includes(me.role);

  const onDelete = async (userId: string) => {
    if (!confirm('Delete this user from organization? This cannot be undone.')) return;
    setBusyId(userId);
    try {
      await api.removeMember(userId);
      await mutate();
    } finally {
      setBusyId(null);
    }
  };

  const onResend = async (userId: string) => {
    setBusyId(userId);
    try {
      await api.resendInvite(userId);
      alert('Invite resent.');
    } finally {
      setBusyId(null);
    }
  };

  const onSyncAll = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await api.syncTeamNow();
      setSyncResult({ synced: result.synced, failed: result.failed });
      await mutate();
    } finally {
      setSyncing(false);
    }
  };

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

      <div className="panel flex items-center justify-between rounded-2xl p-4">
        <div>
          <h1 className="text-2xl font-semibold text-white [font-family:var(--font-heading)]">Team Members</h1>
          <p className="mt-1 text-sm text-slate-300">
            {activeCount} active · {pendingCount} pending invites · last week's health signals
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
              className="input w-48 pl-9 pr-4"
            />
          </div>
          <button
            onClick={onSyncAll}
            disabled={syncing}
            className="btn-secondary gap-2 py-2 px-4 text-sm"
            title="Refresh all members' data from their connected integrations"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync All'}
          </button>
          <button onClick={() => setShowInvite(true)} className="btn-primary gap-2 py-2 px-4 text-sm">
            <UserPlus className="w-4 h-4" />
            Invite
          </button>
        </div>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm backdrop-blur-xl ${syncResult.failed > 0 ? 'border-amber-200/20 bg-amber-300/10 text-amber-100' : 'border-emerald-200/20 bg-emerald-300/10 text-emerald-100'}`}>
          <span>
            Sync complete — {syncResult.synced} member{syncResult.synced !== 1 ? 's' : ''} updated
            {syncResult.failed > 0 ? `, ${syncResult.failed} failed (check integrations)` : '.'}
          </span>
          <button onClick={() => setSyncResult(null)} className="ml-4 text-current opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Privacy reminder */}
      <div className="glass-tint-blue card flex items-start gap-2 rounded-xl p-3">
        <AlertTriangle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-cyan-100">
          These scores reflect team health signals, not individual performance. Use them to start
          supportive conversations — not for evaluation. Members can view and delete their own data at any time.
        </p>
      </div>

      <div className="glass-table">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="w-48 px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-400">Member</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-400">Risk Level</th>
              <th className="w-48 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-400">Signals</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-400">Activity</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-400">Trend</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-400">Integrations</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {filtered.map((member) => (
              <tr key={member.id} className={clsx('transition-colors', member.is_active ? 'hover:bg-white/5' : 'bg-white/5 opacity-70')}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt={member.name} className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className={clsx('flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium', member.is_active ? 'bg-cyan-300/10 text-cyan-100' : 'bg-white/10 text-slate-400')}>
                        {(member.name?.[0] || member.email[0]).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{member.name || member.email.split('@')[0]}</span>
                        {!member.is_active && (
                          <span className="rounded-full bg-amber-300/10 px-2 py-0.5 text-[10px] font-medium text-amber-100">Invite pending</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">{member.email}</div>
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
                  {member.is_active ? (
                    <ActivityStats member={member} />
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
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

                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    {member.is_active && (
                      <Link href={`/dashboard/members/${member.id}`} className="btn-secondary px-2.5 py-1.5 text-[11px]">
                        <ChevronRight className="h-3 w-3" />
                        Open
                      </Link>
                    )}
                    {isAdmin && (
                      <>
                      {!member.is_active && (
                        <button
                          onClick={() => onResend(member.id)}
                          disabled={busyId === member.id}
                          className="btn-secondary px-2.5 py-1.5 text-[11px]"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Resend
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(member.id)}
                        disabled={busyId === member.id}
                        className="btn-secondary px-2.5 py-1.5 text-[11px]"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-500 text-sm">
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
