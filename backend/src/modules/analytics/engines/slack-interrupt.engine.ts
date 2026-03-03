/**
 * Slack Interrupt Score Engine
 *
 * Measures how disruptive Slack activity is (0–100, higher = more interrupted).
 * Key signals:
 *   - Messages sent during calendar-blocked focus time
 *   - Messages spread across many small bursts (reactive mode)
 *   - High message count during work hours
 */

import { DailyAggregate } from "../analytics.types";

export function computeSlackInterruptScore(aggregates: DailyAggregate[]): {
  score: number;
  breakdown: Record<string, number>;
} {
  const days = aggregates.filter((d) => d.slack_messages_sent > 0);
  if (!days.length) return { score: 0, breakdown: { noSlackData: 1 } };

  const avgMessagesPerDay =
    days.reduce((s, d) => s + d.slack_messages_sent, 0) / days.length;
  const avgChannelsActive =
    days.reduce((s, d) => s + d.slack_channels_active, 0) / days.length;
  const totalDays = aggregates.length;

  // Component 1: Message volume (0–50)
  // 0-20 msg/day = low, 20-50 = moderate, 50-100 = high, 100+ = very high
  const volumeScore = Math.min(50, (avgMessagesPerDay / 100) * 50);

  // Component 2: Channel spread (0–30)
  // Being active in many channels = more context switching
  // 1-3 channels = focused, 4-6 = moderate, 7+ = scattered
  const channelScore = Math.min(30, ((avgChannelsActive - 2) / 8) * 30);

  // Component 3: Consistency of interruptions (0–20)
  // If Slack is active every day including weekends, higher score
  const weekendDays = aggregates.filter((d) => {
    const dow = new Date(d.date).getDay();
    return (dow === 0 || dow === 6) && d.slack_messages_sent > 0;
  });
  const weekendActivity = totalDays > 0 ? weekendDays.length / totalDays : 0;
  const consistencyScore = Math.min(20, weekendActivity * 40);

  const score = Math.round(
    Math.max(0, Math.min(100, volumeScore + channelScore + consistencyScore)),
  );

  return {
    score,
    breakdown: {
      avgMessagesPerDay: Math.round(avgMessagesPerDay),
      avgChannelsActive: Math.round(avgChannelsActive * 10) / 10,
      weekendSlackDays: weekendDays.length,
      volumeScore: Math.round(volumeScore),
      channelScore: Math.round(channelScore),
      consistencyScore: Math.round(consistencyScore),
    },
  };
}
