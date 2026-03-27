'use client';

import useSWR from 'swr';
import { api, TeamCalendarDay } from '@/lib/api';
import { useState, useMemo } from 'react';
import { format, addDays, startOfWeek, subWeeks, addWeeks, parseISO } from 'date-fns';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

const LOAD_COLORS = {
  low:      { bg: 'bg-green-100',   border: 'border-green-200',   text: 'text-green-700',   label: 'Low' },
  medium:   { bg: 'bg-amber-100',   border: 'border-amber-200',   text: 'text-amber-700',   label: 'Med' },
  high:     { bg: 'bg-red-100',     border: 'border-red-200',     text: 'text-red-700',     label: 'High' },
  critical: { bg: 'bg-red-900/15',  border: 'border-red-300',     text: 'text-red-900',     label: 'Crit' },
};

function CalendarCell({ day }: { day: TeamCalendarDay | undefined }) {
  const [hovered, setHovered] = useState(false);

  if (!day) {
    return (
      <div className="h-14 rounded-lg border border-white/10 bg-white/5" />
    );
  }

  const c = LOAD_COLORS[day.loadLevel];

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={clsx(
          'h-14 rounded-lg border flex cursor-default select-none flex-col items-center justify-center gap-0.5 transition-all backdrop-blur-xl',
          c.bg, c.border,
        )}
      >
        <span className={clsx('text-xs font-semibold', c.text)}>{c.label}</span>
        <span className="text-[10px] text-slate-300">{day.meetingMinutes}min</span>
      </div>

      {/* Tooltip */}
      {hovered && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 w-44 -translate-x-1/2 space-y-1 rounded-xl border border-white/10 bg-slate-950/85 p-3 text-xs shadow-lg backdrop-blur-2xl pointer-events-none">
          <p className="mb-1 font-semibold text-white">{day.memberName}</p>
          <div className="flex justify-between text-slate-300">
            <span>Meetings</span>
            <span className="font-medium">{day.meetingCount} ({day.meetingMinutes} min)</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Focus time</span>
            <span className="font-medium">{day.focusMinutes} min</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>After-hours</span>
            <span className="font-medium">{day.afterHoursEvents} events</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeamCalendarPage() {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );

  const startStr = format(weekStart, 'yyyy-MM-dd');
  const { data, isLoading } = useSWR<TeamCalendarDay[]>(
    ['team-calendar', startStr],
    () => api.getTeamCalendar(startStr),
  );

  // Build structure: { memberName → { dateStr → CalendarDay } }
  const { members, days } = useMemo(() => {
    const daysList = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)); // Mon–Fri
    const memberMap = new Map<string, { name: string; byDate: Map<string, TeamCalendarDay> }>();

    for (const day of data || []) {
      if (!memberMap.has(day.userId)) {
        memberMap.set(day.userId, { name: day.memberName, byDate: new Map() });
      }
      memberMap.get(day.userId)!.byDate.set(day.date, day);
    }

    return {
      members: Array.from(memberMap.values()),
      days: daysList,
    };
  }, [data, weekStart]);

  // "Best day to schedule" — day where the fewest members are high/critical
  const bestDay = useMemo(() => {
    if (!members.length) return null;
    let minLoad = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < days.length; i++) {
      const dateStr = format(days[i], 'yyyy-MM-dd');
      const heavyCount = members.filter((m) => {
        const d = m.byDate.get(dateStr);
        return d && (d.loadLevel === 'high' || d.loadLevel === 'critical');
      }).length;
      if (heavyCount < minLoad) {
        minLoad = heavyCount;
        bestIdx = i;
      }
    }
    return days[bestIdx];
  }, [members, days]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-700 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 reveal-up">
      {/* Header */}
      <div className="panel flex items-center justify-between rounded-2xl p-4">
        <div>
          <h1 className="text-2xl font-semibold text-white [font-family:var(--font-heading)]">Team Calendar</h1>
          <p className="mt-1 text-sm text-slate-300">Weekly busyness heatmap — plan meetings on low-load days</p>
        </div>

        {/* Week navigator */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((w) => subWeeks(w, 1))}
            className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/10"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="min-w-[140px] text-center text-sm font-medium text-white">
            {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 4), 'MMM d, yyyy')}
          </span>
          <button
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
            className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/10"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="ml-1 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/10"
          >
            This week
          </button>
        </div>
      </div>

      {/* Privacy note */}
      <div className="glass-tint-blue card flex items-start gap-2 rounded-xl p-3">
        <AlertTriangle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-cyan-100">
          Load levels are derived from meeting duration and after-hours activity only — no content is displayed.
          Only members who have enabled data collection are shown.
        </p>
      </div>

      {/* Grid */}
      {members.length === 0 ? (
        <div className="card p-12 text-center text-sm text-slate-300">
          No data available for this week yet. Sync your calendar to see load levels.
        </div>
      ) : (
        <div className="glass-table">
          {/* Day headers */}
          <div
            className="grid border-b border-white/10 bg-white/5"
            style={{ gridTemplateColumns: `180px repeat(5, 1fr)` }}
          >
            <div className="px-4 py-3" />
            {days.map((d) => (
              <div key={d.toISOString()} className="px-2 py-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {format(d, 'EEE')}
                </p>
                <p className="text-sm font-medium text-white">{format(d, 'MMM d')}</p>
              </div>
            ))}
          </div>

          {/* Member rows */}
          <div className="divide-y divide-white/10">
            {members.map((member) => (
              <div
                key={member.name}
                className="grid items-center gap-2 px-4 py-3"
                style={{ gridTemplateColumns: `180px repeat(5, 1fr)` }}
              >
                <div className="truncate pr-2 text-sm font-medium text-white">{member.name}</div>
                {days.map((d) => {
                  const dateStr = format(d, 'yyyy-MM-dd');
                  return (
                    <CalendarCell key={dateStr} day={member.byDate.get(dateStr)} />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend + best day insight */}
      <div className="flex items-center justify-between">
        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span className="font-medium">Load level:</span>
          {Object.entries(LOAD_COLORS).map(([key, val]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={clsx('w-3 h-3 rounded', val.bg, 'border', val.border)} />
              {val.label}
            </span>
          ))}
        </div>

        {/* Best day insight */}
        {bestDay && members.length > 0 && (
          <div className="rounded-xl border border-emerald-200/20 bg-emerald-300/10 px-4 py-2 text-xs text-emerald-100 backdrop-blur-xl">
            Best day to schedule a team meeting:{' '}
            <span className="font-semibold">{format(bestDay, 'EEEE, MMM d')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
