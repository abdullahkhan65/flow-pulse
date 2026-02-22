/**
 * Meeting Load Engine
 *
 * Scores how heavy a user's meeting burden is (0–100, higher = more loaded).
 * Factored inputs:
 *   - Daily average meeting minutes
 *   - Back-to-back meeting count
 *   - % of work day spent in meetings
 */

import { DailyAggregate } from '../analytics.types';

const WORK_DAY_MINUTES = 8 * 60; // 480 min

export function computeMeetingLoadScore(aggregates: DailyAggregate[]): {
  score: number;
  breakdown: Record<string, number>;
} {
  const workDays = aggregates.filter((d) => d.meeting_count >= 0);
  if (!workDays.length) return { score: 0, breakdown: {} };

  const totalMeetingMinutes = workDays.reduce((s, d) => s + d.total_meeting_minutes, 0);
  const totalBackToBack = workDays.reduce((s, d) => s + d.back_to_back_meetings, 0);
  const avgMeetingMinutesPerDay = totalMeetingMinutes / workDays.length;
  const avgMeetingCount = workDays.reduce((s, d) => s + d.meeting_count, 0) / workDays.length;

  // Component 1: Minutes in meetings (0–60 score)
  // 0 min = 0, 60 min = 12, 120 min = 25, 240 min = 50, 360+ min = 60
  const minutesScore = Math.min(60, (avgMeetingMinutesPerDay / WORK_DAY_MINUTES) * 100);

  // Component 2: Back-to-back meetings penalty (0–25 score)
  // Each B2B meeting per week adds ~5 points, capped at 25
  const b2bScore = Math.min(25, totalBackToBack * 5);

  // Component 3: Meeting count (0–15 score)
  // >8 meetings/day is excessive
  const countScore = Math.min(15, (avgMeetingCount / 8) * 15);

  const rawScore = minutesScore + b2bScore + countScore;
  const score = Math.round(Math.min(100, rawScore));

  return {
    score,
    breakdown: {
      avgMeetingMinutesPerDay: Math.round(avgMeetingMinutesPerDay),
      avgMeetingCount: Math.round(avgMeetingCount * 10) / 10,
      totalBackToBack,
      minutesScore: Math.round(minutesScore),
      b2bScore: Math.round(b2bScore),
      countScore: Math.round(countScore),
    },
  };
}
