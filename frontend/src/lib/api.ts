const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('fp_token');
}

export function getStoredToken(): string | null {
  return getToken();
}

export function setToken(token: string) {
  localStorage.setItem('fp_token', token);
  document.cookie = `fp_token=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`;
}

export function clearToken() {
  localStorage.removeItem('fp_token');
  document.cookie = 'fp_token=; Path=/; Max-Age=0; SameSite=Lax';
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data as T;
}

export const api = {
  // Auth
  getMe: () => request<User>('/auth/me'),
  adminLogin: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/admin-login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  // Dashboard — sync + preview (works from day 1)
  syncNow: () => request<PreviewData>('/dashboard/sync-now', { method: 'POST' }),
  getPreview: () => request<PreviewData>('/dashboard/preview'),

  // Dashboard
  getTeamDashboard: (weeks?: number) =>
    request<TeamDashboard>(`/dashboard/team${weeks ? `?weeks=${weeks}` : ''}`),
  getTeamMembers: () => request<TeamMember[]>('/dashboard/team/members'),
  getMemberScores: (userId: string, weeks?: number) =>
    request<MemberScores>(`/dashboard/members/${userId}${weeks ? `?weeks=${weeks}` : ''}`),
  getMyScores: (weeks?: number) =>
    request<MemberScores>(`/dashboard/me/scores${weeks ? `?weeks=${weeks}` : ''}`),
  getIntegrations: () => request<Integration[]>(`/dashboard/integrations`),

  // Jira tickets
  getJiraTickets: () => request<JiraTicketSummary>(`/dashboard/me/jira-tickets`),

  // Integrations
  connectSlack: () => request<{ url: string }>('/integrations/slack/connect'),
  connectJira: () => request<{ url: string }>('/integrations/jira/connect'),
  connectGithub: () => request<{ url: string }>('/integrations/github/connect'),
  updateGithubSettings: (payload: { timeWindowDays: number; repoAllowlist: string[] }) =>
    request<{ success: boolean }>('/integrations/github/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // Team calendar
  getTeamCalendar: (start?: string) =>
    request<TeamCalendarDay[]>(`/dashboard/team/calendar${start ? `?start=${start}` : ''}`),

  // Billing
  getBillingStatus: () => request<BillingStatus>('/billing/status'),
  createCheckoutSession: (seats: number) =>
    request<{ url: string }>('/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ seats }),
    }),
  getBillingPortal: () => request<{ url: string }>('/billing/portal'),

  // Organization
  getOrg: () => request<Organization>('/organizations/me'),
  updateOrgSettings: (settings: any) =>
    request<Organization>('/organizations/me/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),
  getMembers: () => request<TeamMember[]>('/organizations/me/members'),
  inviteMember: (email: string, role?: string) =>
    request('/organizations/me/members/invite', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),
  removeMember: (userId: string) =>
    request<{ deleted: boolean }>(`/organizations/me/members/${userId}`, {
      method: 'DELETE',
    }),
  resendInvite: (userId: string) =>
    request<{ sent: boolean }>(`/organizations/me/members/${userId}/resend-invite`, {
      method: 'POST',
    }),

  // User
  updateProfile: (updates: { name?: string; timezone?: string }) =>
    request<User>('/users/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  updateConsent: (consent: boolean) =>
    request('/users/me/consent', {
      method: 'PATCH',
      body: JSON.stringify({ consent }),
    }),
  getMyData: () => request('/users/me/data'),
  deleteMyData: () =>
    request('/users/me/data', { method: 'DELETE' }),
  updateNotifications: (prefs: any) =>
    request('/users/me/notifications', {
      method: 'PATCH',
      body: JSON.stringify(prefs),
    }),

  // Public blog
  getBlogPosts: (limit?: number) =>
    request<BlogPostSummary[]>(`/blog/posts${limit ? `?limit=${limit}` : ''}`),
  getBlogPostBySlug: (slug: string) =>
    request<BlogPost>(`/blog/posts/${slug}`),

  // Admin
  getAdminOverview: () => request<AdminOverview>('/admin/overview'),
  getAdminBlogPosts: () => request<BlogPost[]>('/admin/blog-posts'),
  createAdminBlogPost: (payload: BlogPostInput) =>
    request<BlogPost>('/admin/blog-posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAdminBlogPost: (id: string, payload: BlogPostInput) =>
    request<BlogPost>(`/admin/blog-posts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteAdminBlogPost: (id: string) =>
    request<{ deleted: boolean }>(`/admin/blog-posts/${id}`, { method: 'DELETE' }),
};

// Types
export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  role: 'owner' | 'admin' | 'manager' | 'member';
  timezone: string;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  plan: string;
  data_collection_consent: boolean;
}

export interface TeamDashboard {
  latestWeek: TeamWeeklyScore | null;
  trend: TrendPoint[];
  weekInProgress: WeekInProgress | null;
  memberStats: { total: number; active: number; consented: number };
  integrationStatus: { type: string; connected: number; errored: number; last_synced: string }[];
  activeAnomalies: Anomaly[];
}

export interface TeamWeeklyScore {
  week_start: string;
  avg_meeting_load_score: number;
  avg_context_switch_score: number;
  avg_slack_interrupt_score: number;
  avg_focus_score: number;
  avg_burnout_risk_score: number;
  members_at_risk: number;
  total_members: number;
  insights: Insight[];
  anomalies: Anomaly[];
}

export interface TrendPoint {
  weekStart: string;
  burnoutRisk: number;
  meetingLoad: number;
  focusScore: number;
  membersAtRisk: number;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar_url: string;
  timezone: string;
  is_active: boolean;
  role: string;
  burnout_risk_score: number;
  meeting_load_score: number;
  focus_score: number;
  after_hours_score: number;
  burnout_risk_delta: number;
  risk_flags: string[];
  integrations: Record<string, string>;
}

export interface MemberScores {
  weeklyScores: WeeklyScore[];
  recentDaily: DailyAggregate[];
}

export interface WeeklyScore {
  week_start: string;
  meeting_load_score: number;
  context_switch_score: number;
  slack_interrupt_score: number;
  focus_score: number;
  after_hours_score: number;
  burnout_risk_score: number;
  burnout_risk_delta: number;
  score_breakdown: Record<string, any>;
}

export interface DailyAggregate {
  date: string;
  total_meeting_minutes: number;
  meeting_count: number;
  solo_focus_minutes: number;
  slack_messages_sent: number;
  after_hours_events: number;
  context_switches: number;
}

export interface Integration {
  type: string;
  status: 'active' | 'inactive' | 'error';
  last_synced_at: string;
  error_message?: string;
  slack_team?: string;
  jira_site?: string;
  metadata?: Record<string, any>;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: {
    workdayStart: string;
    workdayEnd: string;
    timezone: string;
    burnoutThreshold: number;
    weeklyDigestEnabled: boolean;
  };
}

export interface Insight {
  type: string;
  priority: 'high' | 'medium' | 'low';
  text: string;
  recommendation: string;
}

export interface Anomaly {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  delta: number;
}

export interface TodaySnapshot {
  meetingsToday: number;
  meetingMinutesToday: number;
  focusMinutesToday: number;
  slackMessagesToday: number;
  afterHoursEventsToday: number;
  contextSwitchesToday: number;
  backToBackToday: number;
  emailsSentToday: number;
  emailsReceivedToday: number;
  githubEventsToday: number;
}

export interface PartialScores {
  meetingLoadScore: number;
  contextSwitchScore: number;
  slackInterruptScore: number;
  focusScore: number;
  afterHoursScore: number;
  githubLoadScore: number;
  jiraLoadScore: number;
  burnoutRiskScore: number;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  riskFlags: string[];
}

export interface PreviewData {
  isPartial: true;
  daysCollected: number;
  totalJiraCompleted: number;
  totalJiraTransitions: number;
  totalJiraAfterHours: number;
  daysNeededForFull: number;
  confidence: 'none' | 'low' | 'medium' | 'high';
  hasEnoughForFullScores: boolean;
  dataFrom: string | null;
  lastSyncedAt: string | null;
  todaySnapshot: TodaySnapshot | null;
  thisWeekSoFar: {
    totalMeetings: number;
    totalMeetingMinutes: number;
    avgMeetingMinutesPerDay: number;
    backToBackMeetings: number;
    afterHoursEvents: number;
    totalSlackMessages: number;
    totalFocusMinutes: number;
    avgFocusMinutesPerDay: number;
    totalEmailsSent: number;
    totalEmailsReceived: number;
    afterHoursEmails: number;
    avgEmailResponseMin: number | null;
    totalGithubCommits: number;
    totalGithubPrReviews: number;
    totalGithubPrsCreated: number;
    githubAfterHoursEvents: number;
    jiraTransitions: number;
    jiraIssuesCompleted: number;
    jiraAfterHoursTransitions: number;
    jiraTodoCount: number;
    jiraInProgressCount: number;
  } | null;
  signalCoverage: {
    calendar: { connected: boolean; daysWithData: number; totalEvents: number; coveragePct: number };
    email: { connected: boolean; daysWithData: number; totalEvents: number; coveragePct: number };
    github: { connected: boolean; daysWithData: number; totalEvents: number; coveragePct: number };
  };
  partialScores: PartialScores | null;
}

export interface BillingStatus {
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'none';
  plan: string;
  seats: number;
  activeSeats: number;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  daysLeftInTrial: number | null;
}

export interface TeamCalendarDay {
  userId: string;
  memberName: string;
  date: string;
  loadLevel: 'low' | 'medium' | 'high' | 'critical';
  meetingMinutes: number;
  focusMinutes: number;
  afterHoursEvents: number;
  meetingCount: number;
}

export interface WeekInProgress {
  weekStart: string;
  membersWithData: number;
  avgDailyMeetingMinutes: number;
  avgDailyFocusMinutes: number;
  totalAfterHoursEvents: number;
  totalBackToBack: number;
  daysCollected: number;
  totalJiraCompleted: number;
  totalJiraTransitions: number;
  totalJiraAfterHours: number;
}

export interface JiraTicket {
  key: string;
  summary: string;
  issueType: string;
  priority: string;
  status: string;
  updatedAt: string;
}

export interface JiraTicketSummary {
  connected: boolean;
  completedThisWeek: Array<{
    issueType: string;
    priority: string;
    completedAt: string;
    afterHours: boolean;
    weekend: boolean;
  }>;
  toDo: JiraTicket[];
  inProgress: JiraTicket[];
  workload: {
    todoCount: number;
    inProgressCount: number;
    completedThisWeekCount: number;
    afterHoursUpdates: number;
    weekendUpdates: number;
  };
  velocity: {
    completedCount: number;
    afterHoursTransitions: number;
    weekendTransitions: number;
    totalTransitionsThisWeek: number;
  };
}

export interface BlogPostSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  author_name: string;
  company_name: string | null;
  resource_url: string | null;
  cover_image_url: string | null;
  tags: string[];
  status: 'draft' | 'published';
  published_at: string | null;
  created_at: string;
}

export interface BlogPost extends BlogPostSummary {
  content: string;
  updated_at?: string;
}

export interface BlogPostInput {
  title: string;
  summary: string;
  content: string;
  authorName: string;
  companyName?: string;
  resourceUrl?: string;
  coverImageUrl?: string;
  tags?: string[];
  status?: 'draft' | 'published';
}

export interface AdminOverview {
  totals: {
    organizations: number;
    users: number;
    connectedIntegrations: number;
    blogPosts: {
      total: number;
      published: number;
      draft: number;
    };
  };
  latestUsers: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    created_at: string;
    organization_name: string;
  }>;
  latestBlogPosts: Array<{
    id: string;
    slug: string;
    title: string;
    status: 'draft' | 'published';
    author_name: string;
    company_name: string | null;
    published_at: string | null;
    created_at: string;
  }>;
}
