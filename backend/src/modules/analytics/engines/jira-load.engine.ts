/**
 * Jira Load Engine — measures task/ticket work pressure
 *
 * Signals captured:
 *   - Active workload: TO DO + IN PROGRESS ticket count (tasks currently assigned)
 *   - After-hours activity: ticket transitions or updates outside work hours
 *   - Weekend activity: Jira work on weekends (boundary erosion)
 *   - Task-thrashing: high daily transition rate signals context overload
 *
 * Score: 0–100, higher = worse (more Jira-driven load/pressure)
 *
 * Components:
 *   - Active workload (0–30): normalised count of TO DO + IN PROGRESS tickets
 *   - After-hours ratio (0–35): % of transitions/updates outside work hours
 *   - Weekend activity  (0–20): weekend Jira activity, indicates boundary erosion
 *   - Task thrashing    (0–15): avg transitions/day normalised — high rate = fragmented work
 *
 * Also feeds into the bandwidth score: todoCount + inProgressCount represent
 * the developer's current task load for sprint planning purposes.
 */

import { DailyAggregate } from '../analytics.types';

export interface JiraLoadBreakdown {
  score: number;
  todoCount: number;
  inProgressCount: number;
  activeWorkloadCount: number;
  afterHoursRatio: number;
  weekendRatio: number;
  avgTransitionsPerDay: number;
  workloadComponent: number;
  afterHoursComponent: number;
  weekendComponent: number;
  thrashingComponent: number;
  daysWithData: number;
}

// Status strings Jira uses for "done" — covers Jira Software + Jira Service Management
export const DONE_STATUSES = [
  'Done', 'Closed', 'Resolved', 'Fixed', 'Complete', 'Completed',
  'Released', 'Won\'t Do', 'Duplicate',
];

export function computeJiraLoadScore(aggregates: DailyAggregate[]): { score: number; breakdown: JiraLoadBreakdown } {
  // Use the most recent day's snapshot for workload counts (current state)
  const latestWithWorkload = [...aggregates]
    .reverse()
    .find((d) => (d.jira_todo_count ?? 0) + (d.jira_in_progress_count ?? 0) > 0);

  const todoCount = latestWithWorkload?.jira_todo_count ?? 0;
  const inProgressCount = latestWithWorkload?.jira_in_progress_count ?? 0;
  const activeWorkloadCount = todoCount + inProgressCount;

  const daysWithTransitions = aggregates.filter((d) => d.jira_transitions > 0).length;
  const totalTransitions = aggregates.reduce((s, d) => s + (d.jira_transitions || 0), 0);
  const totalAfterHours = aggregates.reduce((s, d) => s + (d.jira_after_hours_transitions || 0), 0);
  const totalWeekend = aggregates.reduce((s, d) => s + (d.jira_weekend_transitions || 0), 0);

  const hasAnyData = activeWorkloadCount > 0 || daysWithTransitions > 0;

  if (!hasAnyData) {
    const empty: JiraLoadBreakdown = {
      score: 0,
      todoCount: 0,
      inProgressCount: 0,
      activeWorkloadCount: 0,
      afterHoursRatio: 0,
      weekendRatio: 0,
      avgTransitionsPerDay: 0,
      workloadComponent: 0,
      afterHoursComponent: 0,
      weekendComponent: 0,
      thrashingComponent: 0,
      daysWithData: 0,
    };
    return { score: 0, breakdown: empty };
  }

  // 1. Active workload component (0–30)
  // Baseline: ≤3 active tickets = 0. Cap: ≥15 active tickets = 30
  // Rationale: 15+ open tickets assigned to one person = heavy load
  const workloadComponent = Math.min(30, Math.max(0, Math.round(((activeWorkloadCount - 3) / 12) * 30)));

  // 2. After-hours ratio component (0–35)
  // Ratio of after-hours Jira activity to total, scaled to 0–35
  // Threshold: ≥30% after-hours activity = full 35 points
  const afterHoursRatio = totalTransitions > 0 ? totalAfterHours / totalTransitions : 0;
  const afterHoursComponent = Math.min(35, Math.round((afterHoursRatio / 0.3) * 35));

  // 3. Weekend ratio component (0–20)
  // Threshold: ≥20% weekend transitions = full 20 points
  const weekendRatio = totalTransitions > 0 ? totalWeekend / totalTransitions : 0;
  const weekendComponent = Math.min(20, Math.round((weekendRatio / 0.2) * 20));

  // 4. Task-thrashing component (0–15)
  // High daily transition rate signals reactive/fragmented work
  // Baseline: ≤3 transitions/day = 0. Cap: ≥10 transitions/day = 15
  const avgTransitionsPerDay = daysWithTransitions > 0 ? totalTransitions / daysWithTransitions : 0;
  const thrashingComponent = Math.min(15, Math.max(0, Math.round(((avgTransitionsPerDay - 3) / 7) * 15)));

  const rawScore = workloadComponent + afterHoursComponent + weekendComponent + thrashingComponent;
  const score = Math.round(Math.min(100, Math.max(0, rawScore)));

  return {
    score,
    breakdown: {
      score,
      todoCount,
      inProgressCount,
      activeWorkloadCount,
      afterHoursRatio: Math.round(afterHoursRatio * 100) / 100,
      weekendRatio: Math.round(weekendRatio * 100) / 100,
      avgTransitionsPerDay: Math.round(avgTransitionsPerDay * 10) / 10,
      workloadComponent,
      afterHoursComponent,
      weekendComponent,
      thrashingComponent,
      daysWithData: daysWithTransitions,
    },
  };
}
