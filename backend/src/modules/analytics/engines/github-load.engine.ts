import { DailyAggregate } from "../analytics.types";

interface GithubLoadBreakdown {
  volumeScore: number;
  reviewBurdenScore: number;
  afterHoursCodingScore: number;
  weekendCodingScore: number;
  avgEventsPerDay: number;
  avgReviewsPerDay: number;
  avgAfterHoursEventsPerDay: number;
  avgWeekendEventsPerDay: number;
}

/**
 * GitHub load score — 0 to 100, higher = more code-driven work pressure.
 *
 * Components:
 *   Volume (0-40): daily GitHub activity volume
 *   Review burden (0-25): PR review pressure
 *   After-hours coding (0-25): activity outside configured work hours
 *   Weekend coding (0-10): sustained weekend activity
 */
export function computeGithubLoadScore(aggregates: DailyAggregate[]): {
  score: number;
  breakdown: GithubLoadBreakdown;
} {
  if (!aggregates.length) {
    return {
      score: 0,
      breakdown: {
        volumeScore: 0,
        reviewBurdenScore: 0,
        afterHoursCodingScore: 0,
        weekendCodingScore: 0,
        avgEventsPerDay: 0,
        avgReviewsPerDay: 0,
        avgAfterHoursEventsPerDay: 0,
        avgWeekendEventsPerDay: 0,
      },
    };
  }

  const totalEvents = aggregates.reduce(
    (sum, day) =>
      sum +
      (day.github_commits || 0) +
      (day.github_prs_created || 0) +
      (day.github_pr_reviews || 0),
    0,
  );
  const totalReviews = aggregates.reduce(
    (sum, day) => sum + (day.github_pr_reviews || 0),
    0,
  );
  const totalAfterHoursEvents = aggregates.reduce(
    (sum, day) => sum + ((day as any).github_after_hours_events || 0),
    0,
  );
  const totalWeekendEvents = aggregates.reduce(
    (sum, day) => sum + ((day as any).github_weekend_events || 0),
    0,
  );

  const avgEventsPerDay = totalEvents / aggregates.length;
  const avgReviewsPerDay = totalReviews / aggregates.length;
  const avgAfterHoursEventsPerDay = totalAfterHoursEvents / aggregates.length;
  const avgWeekendEventsPerDay = totalWeekendEvents / aggregates.length;

  const volumeScore = Math.min(40, Math.round((avgEventsPerDay / 20) * 40));
  const reviewBurdenScore = Math.min(
    25,
    Math.round((avgReviewsPerDay / 8) * 25),
  );
  const afterHoursCodingScore = Math.min(
    25,
    Math.round((avgAfterHoursEventsPerDay / 4) * 25),
  );
  const weekendCodingScore = Math.min(
    10,
    Math.round((avgWeekendEventsPerDay / 3) * 10),
  );

  const score = Math.min(
    100,
    volumeScore +
      reviewBurdenScore +
      afterHoursCodingScore +
      weekendCodingScore,
  );

  return {
    score,
    breakdown: {
      volumeScore,
      reviewBurdenScore,
      afterHoursCodingScore,
      weekendCodingScore,
      avgEventsPerDay: Math.round(avgEventsPerDay * 10) / 10,
      avgReviewsPerDay: Math.round(avgReviewsPerDay * 10) / 10,
      avgAfterHoursEventsPerDay:
        Math.round(avgAfterHoursEventsPerDay * 10) / 10,
      avgWeekendEventsPerDay: Math.round(avgWeekendEventsPerDay * 10) / 10,
    },
  };
}
