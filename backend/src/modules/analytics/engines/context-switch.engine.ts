/**
 * Context Switch Engine
 *
 * Measures how often a user is forced to shift cognitive modes (0–100, higher = more switching).
 * A context switch is defined as a transition between:
 *   - A meeting → Slack burst (within 30 min)
 *   - Slack burst → meeting
 *   - Jira work → meeting
 *   - Meeting → Jira work
 * Short uninterrupted blocks are NOT penalized.
 */

import { RawActivityLog } from '../analytics.types';
import { differenceInMinutes } from 'date-fns';

interface ActivitySegment {
  type: 'meeting' | 'slack' | 'jira' | 'focus';
  startTime: Date;
}

export function computeContextSwitchScore(logs: RawActivityLog[]): {
  score: number;
  breakdown: Record<string, number>;
} {
  if (!logs.length) return { score: 0, breakdown: {} };

  // Build a time-ordered list of activity segments per day
  const sorted = [...logs].sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime());

  let switches = 0;
  let prevType: string | null = null;
  let prevTime: Date | null = null;

  for (const log of sorted) {
    const currentType = mapSourceToType(log.source, log.event_type);
    const currentTime = log.occurred_at;

    if (prevType && prevTime) {
      const gapMinutes = differenceInMinutes(currentTime, prevTime);

      // Only count as a context switch if:
      // 1. The activity type changed
      // 2. The gap is < 60 minutes (activities are close together in time)
      if (currentType !== prevType && gapMinutes < 60) {
        switches++;
      }
    }

    prevType = currentType;
    prevTime = currentTime;
  }

  // Normalize: 0 switches = 0, 5/day = moderate (40), 10+/day = heavy (80+)
  const daysWithData = new Set(sorted.map((l) => l.occurred_at.toDateString())).size;
  const switchesPerDay = daysWithData > 0 ? switches / daysWithData : 0;

  // Score mapping: 0 = 0, 3/day = 30, 7/day = 70, 12+/day = 100
  const score = Math.round(Math.min(100, (switchesPerDay / 12) * 100));

  return {
    score,
    breakdown: {
      totalSwitches: switches,
      daysAnalyzed: daysWithData,
      switchesPerDay: Math.round(switchesPerDay * 10) / 10,
    },
  };
}

function mapSourceToType(source: string, eventType: string): string {
  if (source === 'google_calendar') return 'meeting';
  if (source === 'slack') return 'slack';
  if (source === 'jira') return 'jira';
  return 'focus';
}
