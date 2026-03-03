import { computeBurnoutRiskScore } from "./burnout-risk.engine";

describe("computeBurnoutRiskScore with GitHub weighting", () => {
  it("includes github component in weighted math", () => {
    const result = computeBurnoutRiskScore({
      meetingLoadScore: 50,
      contextSwitchScore: 40,
      slackInterruptScore: 30,
      focusScore: 60,
      afterHoursScore: 70,
      emailLoadScore: 20,
      githubLoadScore: 80,
    });

    // 70*.20 + 50*.16 + 40*.16 + 20*.10 + 80*.13 + 40*.08 + 30*.07
    // 14 + 8 + 6.4 + 2 + 10.4 + 3.2 + 2.1 = 46.1 -> 46
    expect(result.burnoutRiskScore).toBe(46);
    expect(result.weightedComponents.githubLoad).toBe(10.4);
  });

  it("handles absent github/email for backwards compatibility", () => {
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
