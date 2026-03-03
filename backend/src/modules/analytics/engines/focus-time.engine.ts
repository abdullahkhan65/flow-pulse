/**
 * Focus Time Engine
 *
 * Measures available deep-work time (0–100, higher = MORE focus time — inverted scale).
 * A focus block is defined as ≥90 minutes of meeting-free calendar time during work hours.
 */

import { DailyAggregate } from "../analytics.types";

const WORK_DAY_MINUTES = 8 * 60; // 480 min
const DEEP_WORK_THRESHOLD_MIN = 90; // A meaningful focus block

export function computeFocusScore(aggregates: DailyAggregate[]): {
  score: number;
  breakdown: Record<string, number>;
} {
  const workDays = aggregates.filter((d) => {
    const dow = new Date(d.date).getDay();
    return dow !== 0 && dow !== 6;
  });

  if (!workDays.length) return { score: 50, breakdown: {} };

  // Available focus time = work day minutes - meeting minutes
  const avgFocusMinutes =
    workDays.reduce((s, d) => {
      const available = WORK_DAY_MINUTES - d.total_meeting_minutes;
      return s + Math.max(0, available);
    }, 0) / workDays.length;

  // solo_focus_minutes: uninterrupted focus blocks from daily aggregates
  const avgSoloFocusMinutes =
    workDays.reduce((s, d) => s + (d.solo_focus_minutes || 0), 0) /
    workDays.length;

  // Score: 0 = no focus time, 100 = 4+ hours/day of uninterrupted focus
  // 0 min = 0, 60 min = 25, 120 min = 50, 180 min = 75, 240+ min = 100
  const focusRatio = Math.min(1, avgFocusMinutes / WORK_DAY_MINUTES);
  const baseScore = Math.round(focusRatio * 80);

  // Bonus for deep focus blocks (≥90 min)
  const deepWorkBonus = Math.min(
    20,
    (avgSoloFocusMinutes / DEEP_WORK_THRESHOLD_MIN) * 10,
  );
  const score = Math.round(Math.min(100, baseScore + deepWorkBonus));

  return {
    score,
    breakdown: {
      avgFocusMinutesPerDay: Math.round(avgFocusMinutes),
      avgSoloFocusMinutesPerDay: Math.round(avgSoloFocusMinutes),
      focusRatio: Math.round(focusRatio * 100),
      baseScore,
      deepWorkBonus: Math.round(deepWorkBonus),
    },
  };
}
