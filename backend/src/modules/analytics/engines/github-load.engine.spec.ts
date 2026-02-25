import { computeGithubLoadScore } from './github-load.engine';
import { DailyAggregate } from '../analytics.types';

function day(overrides: Partial<DailyAggregate>): DailyAggregate {
  return {
    id: '1',
    organization_id: 'o1',
    user_id: 'u1',
    date: new Date(),
    total_meeting_minutes: 0,
    meeting_count: 0,
    back_to_back_meetings: 0,
    solo_focus_minutes: 0,
    slack_messages_sent: 0,
    slack_active_minutes: 0,
    slack_channels_active: 0,
    after_hours_events: 0,
    weekend_events: 0,
    jira_transitions: 0,
    jira_comments: 0,
    context_switches: 0,
    emails_sent: 0,
    emails_received: 0,
    after_hours_emails: 0,
    avg_email_response_min: null,
    github_commits: 0,
    github_pr_reviews: 0,
    github_prs_created: 0,
    github_after_hours_events: 0,
    github_weekend_events: 0,
    ...overrides,
  };
}

describe('computeGithubLoadScore', () => {
  it('returns 0 when no data', () => {
    const result = computeGithubLoadScore([]);
    expect(result.score).toBe(0);
  });

  it('computes moderate workload correctly', () => {
    const result = computeGithubLoadScore([
      day({ github_commits: 8, github_pr_reviews: 2, github_prs_created: 2, github_after_hours_events: 1 }),
      day({ github_commits: 8, github_pr_reviews: 2, github_prs_created: 2, github_after_hours_events: 1 }),
    ]);
    expect(result.breakdown.volumeScore).toBe(24);
    expect(result.breakdown.reviewBurdenScore).toBe(6);
    expect(result.breakdown.afterHoursCodingScore).toBe(6);
    expect(result.score).toBe(36);
  });

  it('caps at 100 for extreme workload', () => {
    const result = computeGithubLoadScore([
      day({
        github_commits: 40,
        github_pr_reviews: 20,
        github_prs_created: 20,
        github_after_hours_events: 15,
        github_weekend_events: 10,
      }),
    ]);
    expect(result.score).toBe(100);
  });
});
