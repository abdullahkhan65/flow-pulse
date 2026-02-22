/**
 * Burnout Risk Engine — the core product insight
 *
 * A weighted composite of all 5 signals (0–100, higher = higher burnout risk).
 * This is NOT a medical diagnosis. It's an operational signal for team leads.
 *
 * Weight rationale:
 *   - After-hours (30%): Strongest predictor of unsustainable work patterns
 *   - Meeting load (25%): Excessive meetings drain cognitive energy
 *   - Focus deprivation (20%): Inability to do deep work = constant reactive mode
 *   - Context switching (15%): Fragmented attention increases cognitive load
 *   - Slack interruptions (10%): Supports the above, correlated but secondary
 *
 * Anomaly detection:
 *   - Week-over-week score increase > 15 points → flag as "rapid escalation"
 *   - Score > 70 → "at risk"
 *   - Score > 85 → "critical risk"
 */

export interface BurnoutScoreInput {
  meetingLoadScore: number;
  contextSwitchScore: number;
  slackInterruptScore: number;
  focusScore: number;       // Higher = MORE focus (inverted for burnout)
  afterHoursScore: number;
  previousWeekBurnoutScore?: number;
}

export interface BurnoutScoreResult {
  burnoutRiskScore: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  riskFlags: string[];
  delta?: number;
  weightedComponents: {
    afterHours: number;
    meetingLoad: number;
    focusDeprivation: number;
    contextSwitching: number;
    slackInterrupt: number;
  };
}

const WEIGHTS = {
  afterHours: 0.30,
  meetingLoad: 0.25,
  focusDeprivation: 0.20,
  contextSwitching: 0.15,
  slackInterrupt: 0.10,
};

export function computeBurnoutRiskScore(input: BurnoutScoreInput): BurnoutScoreResult {
  // Focus score is inverted: high focus = low burnout risk
  const focusDeprivationScore = 100 - input.focusScore;

  const weightedComponents = {
    afterHours: input.afterHoursScore * WEIGHTS.afterHours,
    meetingLoad: input.meetingLoadScore * WEIGHTS.meetingLoad,
    focusDeprivation: focusDeprivationScore * WEIGHTS.focusDeprivation,
    contextSwitching: input.contextSwitchScore * WEIGHTS.contextSwitching,
    slackInterrupt: input.slackInterruptScore * WEIGHTS.slackInterrupt,
  };

  const rawScore =
    weightedComponents.afterHours +
    weightedComponents.meetingLoad +
    weightedComponents.focusDeprivation +
    weightedComponents.contextSwitching +
    weightedComponents.slackInterrupt;

  const burnoutRiskScore = Math.round(Math.min(100, Math.max(0, rawScore)));

  // Risk level
  let riskLevel: BurnoutScoreResult['riskLevel'];
  if (burnoutRiskScore >= 85) riskLevel = 'critical';
  else if (burnoutRiskScore >= 70) riskLevel = 'high';
  else if (burnoutRiskScore >= 50) riskLevel = 'moderate';
  else riskLevel = 'low';

  // Explainable flags — plain language, actionable
  const riskFlags: string[] = [];

  if (input.afterHoursScore > 60) {
    riskFlags.push('Frequent activity outside work hours');
  }
  if (input.meetingLoadScore > 70) {
    riskFlags.push('Heavy meeting load leaving little time for deep work');
  }
  if (focusDeprivationScore > 70) {
    riskFlags.push('Insufficient uninterrupted focus time');
  }
  if (input.contextSwitchScore > 60) {
    riskFlags.push('High context switching between tools and tasks');
  }
  if (input.slackInterruptScore > 60) {
    riskFlags.push('High Slack messaging volume suggests reactive work mode');
  }

  // Week-over-week change
  let delta: number | undefined;
  if (input.previousWeekBurnoutScore !== undefined) {
    delta = burnoutRiskScore - input.previousWeekBurnoutScore;
    if (delta > 15) {
      riskFlags.push(`Burnout risk increased ${delta} points week-over-week — rapid escalation`);
    }
  }

  return {
    burnoutRiskScore,
    riskLevel,
    riskFlags,
    delta,
    weightedComponents: {
      afterHours: Math.round(weightedComponents.afterHours * 10) / 10,
      meetingLoad: Math.round(weightedComponents.meetingLoad * 10) / 10,
      focusDeprivation: Math.round(weightedComponents.focusDeprivation * 10) / 10,
      contextSwitching: Math.round(weightedComponents.contextSwitching * 10) / 10,
      slackInterrupt: Math.round(weightedComponents.slackInterrupt * 10) / 10,
    },
  };
}
