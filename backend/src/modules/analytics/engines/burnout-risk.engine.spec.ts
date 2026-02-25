import { computeBurnoutRiskScore } from './burnout-risk.engine';

describe('computeBurnoutRiskScore with GitHub weighting', () => {
  it('includes github component in weighted math', () => {
    const result = computeBurnoutRiskScore({
      meetingLoadScore: 50,
      contextSwitchScore: 40,
      slackInterruptScore: 30,
      focusScore: 60,
      afterHoursScore: 70,
      emailLoadScore: 20,
      githubLoadScore: 80,
    });

    // 70*.22 + 50*.18 + (40)*.18 + 20*.12 + 80*.15 + 40*.08 + 30*.07
    // 15.4 + 9 + 7.2 + 2.4 + 12 + 3.2 + 2.1 = 51.3 -> 51
    expect(result.burnoutRiskScore).toBe(51);
    expect(result.weightedComponents.githubLoad).toBe(12);
  });

  it('handles absent github/email for backwards compatibility', () => {
    const result = computeBurnoutRiskScore({
      meetingLoadScore: 20,
      contextSwitchScore: 20,
      slackInterruptScore: 20,
      focusScore: 80,
      afterHoursScore: 20,
    });
    expect(result.burnoutRiskScore).toBeGreaterThanOrEqual(0);
    expect(result.weightedComponents.githubLoad).toBe(0);
    expect(result.weightedComponents.emailLoad).toBe(0);
  });
});
