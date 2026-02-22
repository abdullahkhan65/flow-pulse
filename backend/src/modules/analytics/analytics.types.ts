export interface DailyAggregate {
  id: string;
  organization_id: string;
  user_id: string;
  date: Date;
  total_meeting_minutes: number;
  meeting_count: number;
  back_to_back_meetings: number;
  solo_focus_minutes: number;
  slack_messages_sent: number;
  slack_active_minutes: number;
  slack_channels_active: number;
  after_hours_events: number;
  weekend_events: number;
  jira_transitions: number;
  jira_comments: number;
  context_switches: number;
}

export interface RawActivityLog {
  id: string;
  organization_id: string;
  user_id: string;
  source: 'google_calendar' | 'slack' | 'jira';
  event_type: string;
  occurred_at: Date;
  duration_seconds?: number;
  participants_count?: number;
  is_recurring: boolean;
  is_after_hours: boolean;
  is_weekend: boolean;
  metadata: Record<string, any>;
}

export interface WeeklyScoreResult {
  userId: string;
  weekStart: Date;
  meetingLoadScore: number;
  contextSwitchScore: number;
  slackInterruptScore: number;
  focusScore: number;
  afterHoursScore: number;
  burnoutRiskScore: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  riskFlags: string[];
  breakdown: Record<string, any>;
}
