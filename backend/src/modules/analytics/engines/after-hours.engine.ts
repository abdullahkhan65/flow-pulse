/**
 * After-Hours Activity Engine
 *
 * Measures work activity outside defined work hours (0–100, higher = more after-hours activity).
 * Signals: meetings, Slack, Jira transitions outside 9am–6pm and on weekends.
 */

import { DailyAggregate } from '../analytics.types';

export function computeAfterHoursScore(aggregates: DailyAggregate[]): {
  score: number;
  breakdown: Record<string, number>;
} {
  if (!aggregates.length) return { score: 0, breakdown: {} };

  const totalAfterHoursEvents = aggregates.reduce((s, d) => s + d.after_hours_events, 0);
  const totalWeekendEvents = aggregates.reduce((s, d) => s + d.weekend_events, 0);
  const daysWithAnyActivity = aggregates.filter(
    (d) => d.after_hours_events > 0 || d.total_meeting_minutes > 0,
  ).length;

  // Component 1: Frequency of after-hours events (0–60)
  // 0 events = 0, 3/day = 18, 10/day = 60
  const avgAfterHoursPerDay = daysWithAnyActivity > 0 ? totalAfterHoursEvents / daysWithAnyActivity : 0;
  const frequencyScore = Math.min(60, (avgAfterHoursPerDay / 10) * 60);

  // Component 2: Weekend activity (0–40)
  // Any weekend activity is a yellow/red flag for healthy boundaries
  const weekendScore = Math.min(40, totalWeekendEvents * 5);

  const score = Math.round(Math.min(100, frequencyScore + weekendScore));

  return {
    score,
    breakdown: {
      totalAfterHoursEvents,
      totalWeekendEvents,
      avgAfterHoursPerDay: Math.round(avgAfterHoursPerDay * 10) / 10,
      frequencyScore: Math.round(frequencyScore),
      weekendScore: Math.round(weekendScore),
    },
  };
}
