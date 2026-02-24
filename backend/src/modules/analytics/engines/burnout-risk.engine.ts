/**
 * Burnout Risk Engine — the core product insight
 *
 * A weighted composite of 6 signals (0–100, higher = higher burnout risk).
 * This is NOT a medical diagnosis. It's an operational signal for team leads.
 *
 * Weight rationale:
 *   - After-hours (25%): Strongest predictor of unsustainable work patterns
 *   - Meeting load (20%): Excessive meetings drain cognitive energy
 *   - Focus deprivation (20%): Inability to do deep work = constant reactive mode
 *   - Email load (15%): After-hours emails + hyper-responsiveness signals
 *   - Context switching (10%): Fragmented attention increases cognitive load
 *   - Slack interruptions (10%): Supports the above, correlated but secondary
 */

export interface BurnoutScoreInput {
  meetingLoadScore: number;
  contextSwitchScore: number;
  slackInterruptScore: number;
  focusScore: number;       // Higher = MORE focus (inverted for burnout)
  afterHoursScore: number;
  emailLoadScore?: number;  // New: email-based stress signal (optional for backwards compat)
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
    emailLoad: number;
    contextSwitching: number;
    slackInterrupt: number;
  };
}

const WEIGHTS = {
  afterHours: 0.25,
  meetingLoad: 0.20,
  focusDeprivation: 0.20,
  emailLoad: 0.15,
  contextSwitching: 0.10,
  slackInterrupt: 0.10,
};

export function computeBurnoutRiskScore(input: BurnoutScoreInput): BurnoutScoreResult {
  const focusDeprivationScore = 100 - input.focusScore;
  const emailLoad = input.emailLoadScore ?? 0;

  const weightedComponents = {
    afterHours: input.afterHoursScore * WEIGHTS.afterHours,
    meetingLoad: input.meetingLoadScore * WEIGHTS.meetingLoad,
    focusDeprivation: focusDeprivationScore * WEIGHTS.focusDeprivation,
    emailLoad: emailLoad * WEIGHTS.emailLoad,
    contextSwitching: input.contextSwitchScore * WEIGHTS.contextSwitching,
    slackInterrupt: input.slackInterruptScore * WEIGHTS.slackInterrupt,
  };

  const rawScore =
    weightedComponents.afterHours +
    weightedComponents.meetingLoad +
    weightedComponents.focusDeprivation +
    weightedComponents.emailLoad +
    weightedComponents.contextSwitching +
    weightedComponents.slackInterrupt;

  const burnoutRiskScore = Math.round(Math.min(100, Math.max(0, rawScore)));

  let riskLevel: BurnoutScoreResult['riskLevel'];
  if (burnoutRiskScore >= 85) riskLevel = 'critical';
  else if (burnoutRiskScore >= 70) riskLevel = 'high';
  else if (burnoutRiskScore >= 50) riskLevel = 'moderate';
  else riskLevel = 'low';

  const riskFlags: string[] = [];

  if (input.afterHoursScore > 60) riskFlags.push('Frequent activity outside work hours');
  if (input.meetingLoadScore > 70) riskFlags.push('Heavy meeting load leaving little time for deep work');
  if (focusDeprivationScore > 70) riskFlags.push('Insufficient uninterrupted focus time');
  if (emailLoad > 55) riskFlags.push('High email volume or after-hours email activity');
  if (input.contextSwitchScore > 60) riskFlags.push('High context switching between tools and tasks');
  if (input.slackInterruptScore > 60) riskFlags.push('High Slack messaging volume suggests reactive work mode');

  let delta: number | undefined;
  if (input.previousWeekBurnoutScore !== undefined) {
    delta = burnoutRiskScore - input.previousWeekBurnoutScore;
    if (delta > 15) {
      riskFlags.push(`Burnout risk increased ${Math.round(delta)} points week-over-week — rapid escalation`);
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
      emailLoad: Math.round(weightedComponents.emailLoad * 10) / 10,
      contextSwitching: Math.round(weightedComponents.contextSwitching * 10) / 10,
      slackInterrupt: Math.round(weightedComponents.slackInterrupt * 10) / 10,
    },
  };
}
