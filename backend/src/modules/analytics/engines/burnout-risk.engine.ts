/**
 * Burnout Risk Engine — the core product insight
 *
 * A weighted composite of 7 signals (0–100, higher = higher burnout risk).
 * This is NOT a medical diagnosis. It's an operational signal for team leads.
 *
 * Weight rationale:
 *   - After-hours (22%): Strong predictor of unsustainable work patterns
 *   - Meeting load (18%): Excessive meetings drain cognitive energy
 *   - Focus deprivation (18%): Inability to do deep work = constant reactive mode
 *   - Email load (12%): After-hours emails + hyper-responsiveness signals
 *   - GitHub load (15%): sustained code/review pressure and off-hours coding
 *   - Context switching (8%): Fragmented attention increases cognitive load
 *   - Slack interruptions (7%): Correlated signal, less primary
 */

export interface BurnoutScoreInput {
  meetingLoadScore: number;
  contextSwitchScore: number;
  slackInterruptScore: number;
  focusScore: number;       // Higher = MORE focus (inverted for burnout)
  afterHoursScore: number;
  emailLoadScore?: number;  // New: email-based stress signal (optional for backwards compat)
  githubLoadScore?: number;
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
    githubLoad: number;
    contextSwitching: number;
    slackInterrupt: number;
  };
}

const WEIGHTS = {
  afterHours: 0.22,
  meetingLoad: 0.18,
  focusDeprivation: 0.18,
  emailLoad: 0.12,
  githubLoad: 0.15,
  contextSwitching: 0.08,
  slackInterrupt: 0.07,
};

export function computeBurnoutRiskScore(input: BurnoutScoreInput): BurnoutScoreResult {
  const focusDeprivationScore = 100 - input.focusScore;
  const emailLoad = input.emailLoadScore ?? 0;
  const githubLoad = input.githubLoadScore ?? 0;

  const weightedComponents = {
    afterHours: input.afterHoursScore * WEIGHTS.afterHours,
    meetingLoad: input.meetingLoadScore * WEIGHTS.meetingLoad,
    focusDeprivation: focusDeprivationScore * WEIGHTS.focusDeprivation,
    emailLoad: emailLoad * WEIGHTS.emailLoad,
    githubLoad: githubLoad * WEIGHTS.githubLoad,
    contextSwitching: input.contextSwitchScore * WEIGHTS.contextSwitching,
    slackInterrupt: input.slackInterruptScore * WEIGHTS.slackInterrupt,
  };

  const rawScore =
    weightedComponents.afterHours +
    weightedComponents.meetingLoad +
    weightedComponents.focusDeprivation +
    weightedComponents.emailLoad +
    weightedComponents.githubLoad +
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
  if (githubLoad > 60) riskFlags.push('Sustained GitHub workload or off-hours coding activity');
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
      githubLoad: Math.round(weightedComponents.githubLoad * 10) / 10,
      contextSwitching: Math.round(weightedComponents.contextSwitching * 10) / 10,
      slackInterrupt: Math.round(weightedComponents.slackInterrupt * 10) / 10,
    },
  };
}
