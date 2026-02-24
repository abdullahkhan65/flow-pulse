import { DailyAggregate } from '../analytics.types';

interface EmailLoadBreakdown {
  volumeScore: number;        // 0–40: emails sent per day
  afterHoursScore: number;    // 0–40: after-hours email activity
  responseTimeScore: number;  // 0–20: hyper-responsiveness signal
  avgEmailsSentPerDay: number;
  avgAfterHoursEmailsPerDay: number;
  avgResponseTimeMin: number | null;
}

/**
 * Email load score — 0 to 100, higher = more email-driven stress.
 *
 * Components:
 *   Volume (0–40):      avg emails sent > 50/day = 40pts
 *   After-hours (0–40): avg after-hours emails > 5/day = 40pts
 *   Response (0–20):    avg response time < 15 min = 20pts (too responsive = stress signal)
 */
export function computeEmailLoadScore(aggregates: DailyAggregate[]): {
  score: number;
  breakdown: EmailLoadBreakdown;
} {
  if (aggregates.length === 0) {
    return {
      score: 0,
      breakdown: {
        volumeScore: 0,
        afterHoursScore: 0,
        responseTimeScore: 0,
        avgEmailsSentPerDay: 0,
        avgAfterHoursEmailsPerDay: 0,
        avgResponseTimeMin: null,
      },
    };
  }

  const daysWithEmail = aggregates.filter((d) => (d.emails_sent || 0) > 0);
  const avgEmailsSentPerDay =
    daysWithEmail.length > 0
      ? aggregates.reduce((s, d) => s + (d.emails_sent || 0), 0) / aggregates.length
      : 0;

  const avgAfterHoursEmailsPerDay =
    aggregates.reduce((s, d) => s + (d.after_hours_emails || 0), 0) / aggregates.length;

  const responseTimes = aggregates
    .map((d) => d.avg_email_response_min)
    .filter((v): v is number => v !== null && v !== undefined && v > 0);
  const avgResponseTimeMin =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null;

  // Volume score: 0 sent = 0, 50+ sent/day = 40
  const volumeScore = Math.min(40, Math.round((avgEmailsSentPerDay / 50) * 40));

  // After-hours score: 0 = 0, 5+/day = 40
  const afterHoursScore = Math.min(40, Math.round((avgAfterHoursEmailsPerDay / 5) * 40));

  // Response time score: only if we have data
  // < 15 min avg response = max stress signal (20 pts), > 120 min = 0 pts
  let responseTimeScore = 0;
  if (avgResponseTimeMin !== null) {
    if (avgResponseTimeMin < 15) responseTimeScore = 20;
    else if (avgResponseTimeMin < 30) responseTimeScore = 15;
    else if (avgResponseTimeMin < 60) responseTimeScore = 8;
    else responseTimeScore = 0;
  }

  const score = Math.min(100, volumeScore + afterHoursScore + responseTimeScore);

  return {
    score,
    breakdown: {
      volumeScore,
      afterHoursScore,
      responseTimeScore,
      avgEmailsSentPerDay: Math.round(avgEmailsSentPerDay * 10) / 10,
      avgAfterHoursEmailsPerDay: Math.round(avgAfterHoursEmailsPerDay * 10) / 10,
      avgResponseTimeMin: avgResponseTimeMin !== null ? Math.round(avgResponseTimeMin) : null,
    },
  };
}
