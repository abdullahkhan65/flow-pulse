import { Injectable, Inject, Logger } from "@nestjs/common";
import { Pool } from "pg";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { DATABASE_POOL } from "../../../database/database.module";
import { encrypt, decrypt } from "../../../common/utils/encryption";
import { parseISO, getHours, getDay, startOfWeek, format } from "date-fns";
import { DONE_STATUSES } from "../../analytics/engines/jira-load.engine";

// Use Jira's built-in status categories — universal across all workflow configurations
const IN_PROGRESS_JQL_FILTER = `statusCategory = "In Progress"`;
const TODO_JQL_FILTER = `statusCategory = "To Do"`;

export interface JiraTicket {
  key: string;
  summary: string; // Live from Jira — never stored in DB (privacy model)
  issueType: string;
  priority: string;
  status: string;
  updatedAt: string;
}

export interface JiraTicketSummary {
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
    afterHoursUpdates: number; // Tickets updated outside work hours
    weekendUpdates: number;
  };
  velocity: {
    completedCount: number;
    afterHoursTransitions: number;
    weekendTransitions: number;
    totalTransitionsThisWeek: number;
  };
  connected: boolean;
}

@Injectable()
export class JiraService {
  private readonly logger = new Logger(JiraService.name);

  constructor(
    @Inject(DATABASE_POOL) private db: Pool,
    private configService: ConfigService,
  ) {}

  getOAuthUrl(state: string): string {
    const clientId = this.configService.get("jira.clientId");
    const callbackUrl = encodeURIComponent(
      this.configService.get("jira.callbackUrl") ?? "",
    );
    // Classic Jira platform REST API scopes + offline_access to get a refresh token
    const scopes = encodeURIComponent(
      "read:jira-work read:jira-user offline_access",
    );
    return `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=${clientId}&scope=${scopes}&redirect_uri=${callbackUrl}&state=${state}&response_type=code&prompt=consent`;
  }

  async handleCallback(code: string, userId: string, orgId: string) {
    const tokenRes = await axios.post(
      "https://auth.atlassian.com/oauth/token",
      {
        grant_type: "authorization_code",
        client_id: this.configService.get("jira.clientId"),
        client_secret: this.configService.get("jira.clientSecret"),
        code,
        redirect_uri: this.configService.get("jira.callbackUrl"),
      },
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // Get accessible Jira resources
    const resourcesRes = await axios.get(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: "application/json",
        },
      },
    );

    const sites = resourcesRes.data;
    if (!sites.length) throw new Error("No Jira sites found");

    const primarySite = sites[0];
    const encKey = this.configService.get<string>("encryption.key")!;

    await this.db.query(
      `INSERT INTO integrations (organization_id, user_id, type, access_token, refresh_token, token_expires_at, status, metadata)
       VALUES ($1, $2, 'jira', $3, $4, $5, 'active', $6)
       ON CONFLICT (user_id, type) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         token_expires_at = EXCLUDED.token_expires_at,
         status = 'active',
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
      [
        orgId,
        userId,
        encrypt(access_token, encKey),
        refresh_token ? encrypt(refresh_token, encKey) : null,
        new Date(Date.now() + expires_in * 1000),
        JSON.stringify({
          cloudId: primarySite.id,
          siteUrl: primarySite.url,
          siteName: primarySite.name,
        }),
      ],
    );

    return { connected: true, site: primarySite.name };
  }

  private isAfterHours(date: Date, workdayStart = 9, workdayEnd = 18): boolean {
    const hour = getHours(date);
    return hour < workdayStart || hour >= workdayEnd;
  }

  private isWeekend(date: Date): boolean {
    const day = getDay(date);
    return day === 0 || day === 6;
  }

  private async getTokenAndAccountId(
    userId: string,
  ): Promise<{ token: string; cloudId: string; accountId: string } | null> {
    const result = await this.db.query(
      `SELECT access_token, refresh_token, token_expires_at, metadata FROM integrations
       WHERE user_id = $1 AND type = 'jira' AND status = 'active'`,
      [userId],
    );
    if (!result.rows[0]) return null;

    const encKey = this.configService.get<string>("encryption.key")!;
    const row = result.rows[0];
    let token = decrypt(row.access_token, encKey);
    const { cloudId } = row.metadata;

    // Refresh token proactively if it expires within 5 minutes (or is already expired)
    const expiresAt = row.token_expires_at
      ? new Date(row.token_expires_at)
      : null;
    if (expiresAt && expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
      if (row.refresh_token) {
        try {
          const refreshToken = decrypt(row.refresh_token, encKey);
          const tokenRes = await axios.post(
            "https://auth.atlassian.com/oauth/token",
            {
              grant_type: "refresh_token",
              client_id: this.configService.get("jira.clientId"),
              client_secret: this.configService.get("jira.clientSecret"),
              refresh_token: refreshToken,
            },
          );
          const {
            access_token,
            refresh_token: newRefreshToken,
            expires_in,
          } = tokenRes.data;
          token = access_token;
          await this.db.query(
            `UPDATE integrations SET
               access_token = $1,
               refresh_token = COALESCE($2, refresh_token),
               token_expires_at = $3,
               status = 'active',
               updated_at = NOW()
             WHERE user_id = $4 AND type = 'jira'`,
            [
              encrypt(access_token, encKey),
              newRefreshToken ? encrypt(newRefreshToken, encKey) : null,
              new Date(Date.now() + expires_in * 1000),
              userId,
            ],
          );
          this.logger.log(`Refreshed Jira token for user ${userId}`);
        } catch (err: any) {
          const detail = err.response?.data
            ? JSON.stringify(err.response.data)
            : err.message;
          this.logger.warn(
            `Failed to refresh Jira token for user ${userId}: ${detail}`,
          );
          await this.db.query(
            `UPDATE integrations SET status = 'error', error_message = $1, updated_at = NOW() WHERE user_id = $2 AND type = 'jira'`,
            [
              "Token refresh failed — please reconnect Jira in Settings",
              userId,
            ],
          );
          return null;
        }
      } else {
        this.logger.warn(
          `Jira token expired for user ${userId} and no refresh_token stored`,
        );
      }
    }

    const userResult = await this.db.query(
      `SELECT jira_account_id FROM users WHERE id = $1`,
      [userId],
    );
    let accountId = userResult.rows[0]?.jira_account_id;

    if (!accountId) {
      const meRes = await axios.get(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      accountId = meRes.data.accountId;
      await this.db.query(
        `UPDATE users SET jira_account_id = $1 WHERE id = $2`,
        [accountId, userId],
      );
    }

    return { token, cloudId, accountId };
  }

  async syncUserActivity(userId: string, orgId: string) {
    const ctx = await this.getTokenAndAccountId(userId);
    if (!ctx) return { synced: 0 };

    const { token, cloudId, accountId } = ctx;

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const jql = `assignee = "${accountId}" AND updated >= "${since.split("T")[0]}" ORDER BY updated DESC`;

    const issuesRes = await axios.get(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        params: {
          jql,
          fields: "status,priority,updated,created,issuetype",
          expand: "changelog",
          maxResults: 100,
        },
      },
    );

    const issues = issuesRes.data.issues || [];
    const logs: any[] = [];

    for (const issue of issues) {
      const changelog = issue.changelog?.histories || [];

      for (const history of changelog) {
        const historyDate = parseISO(history.created);
        const statusChanges =
          history.items?.filter((item: any) => item.field === "status") || [];

        if (statusChanges.length > 0) {
          const toStatus: string = statusChanges[0]?.toString ?? "";
          const fromStatus: string = statusChanges[0]?.fromString ?? "";

          logs.push({
            organizationId: orgId,
            userId,
            source: "jira",
            eventType: "jira_transition",
            occurredAt: historyDate,
            isAfterHours: this.isAfterHours(historyDate),
            isWeekend: this.isWeekend(historyDate),
            metadata: {
              issueType: issue.fields.issuetype?.name ?? "Unknown",
              priority: issue.fields.priority?.name ?? "Unknown",
              fromStatus,
              toStatus,
              isCompleted: DONE_STATUSES.some(
                (s) => s.toLowerCase() === toStatus.toLowerCase(),
              ),
              // No issue title/description stored — privacy-first
            },
          });
        }
      }
    }

    // ─── Snapshot: current state of ALL assigned tickets ──────────────────────
    // This captures workload regardless of whether tickets were moved between
    // columns (no changelog needed). One jira_ticket_state event per ticket.
    const allAssignedRes = await axios.get(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        params: {
          jql: `assignee = "${accountId}" AND statusCategory in ("To Do", "In Progress", "Done") ORDER BY updated DESC`,
          fields: "status,priority,issuetype,updated",
          maxResults: 200,
        },
      },
    );

    const snapshotLogs: any[] = [];
    const now = new Date();

    for (const issue of allAssignedRes.data.issues || []) {
      const updatedAt = parseISO(issue.fields.updated);
      const statusCategory: string =
        issue.fields.status?.statusCategory?.key ?? "undefined";
      // Map Jira statusCategory keys: 'new' = To Do, 'indeterminate' = In Progress, 'done' = Done
      const categoryName =
        statusCategory === "new"
          ? "To Do"
          : statusCategory === "indeterminate"
            ? "In Progress"
            : statusCategory === "done"
              ? "Done"
              : "Other";

      snapshotLogs.push({
        organizationId: orgId,
        userId,
        source: "jira",
        eventType: "jira_ticket_state",
        occurredAt: now,
        isAfterHours: this.isAfterHours(updatedAt),
        isWeekend: this.isWeekend(updatedAt),
        metadata: {
          issueKey: issue.key,
          statusCategory: categoryName,
          issueType: issue.fields.issuetype?.name ?? "Unknown",
          priority: issue.fields.priority?.name ?? "Unknown",
          lastUpdatedAfterHours: this.isAfterHours(updatedAt),
          lastUpdatedWeekend: this.isWeekend(updatedAt),
        },
      });
    }

    // ─── Persist both transition logs and state snapshot ──────────────────────
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");

      // Replace transition events for last 7 days
      await client.query(
        `DELETE FROM raw_activity_logs WHERE user_id = $1 AND source = 'jira' AND event_type = 'jira_transition' AND occurred_at >= NOW() - INTERVAL '7 days'`,
        [userId],
      );
      for (const log of logs) {
        await client.query(
          `INSERT INTO raw_activity_logs (organization_id, user_id, source, event_type, occurred_at, is_after_hours, is_weekend, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            log.organizationId,
            log.userId,
            log.source,
            log.eventType,
            log.occurredAt,
            log.isAfterHours,
            log.isWeekend,
            JSON.stringify(log.metadata),
          ],
        );
      }

      // Replace today's state snapshot (fresh every sync)
      await client.query(
        `DELETE FROM raw_activity_logs WHERE user_id = $1 AND source = 'jira' AND event_type = 'jira_ticket_state' AND occurred_at >= CURRENT_DATE`,
        [userId],
      );
      for (const log of snapshotLogs) {
        await client.query(
          `INSERT INTO raw_activity_logs (organization_id, user_id, source, event_type, occurred_at, is_after_hours, is_weekend, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            log.organizationId,
            log.userId,
            log.source,
            log.eventType,
            log.occurredAt,
            log.isAfterHours,
            log.isWeekend,
            JSON.stringify(log.metadata),
          ],
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await this.db.query(
      `UPDATE integrations SET last_synced_at = NOW() WHERE user_id = $1 AND type = 'jira'`,
      [userId],
    );
    this.logger.log(
      `Synced ${logs.length} Jira transition events + ${snapshotLogs.length} ticket state snapshots for user ${userId}`,
    );
    return { synced: logs.length + snapshotLogs.length };
  }

  // ─── Live ticket summary for the dashboard ──────────────────────────────────
  // completedThisWeek: from raw_activity_logs (already stored, no Jira API call)
  // inProgress: live Jira API call for current state
  // Titles are returned live but never stored in our DB (privacy model).

  async getJiraTicketSummary(userId: string): Promise<JiraTicketSummary> {
    const ctx = await this.getTokenAndAccountId(userId);

    if (!ctx) {
      return {
        completedThisWeek: [],
        toDo: [],
        inProgress: [],
        workload: {
          todoCount: 0,
          inProgressCount: 0,
          completedThisWeekCount: 0,
          afterHoursUpdates: 0,
          weekendUpdates: 0,
        },
        velocity: {
          completedCount: 0,
          afterHoursTransitions: 0,
          weekendTransitions: 0,
          totalTransitionsThisWeek: 0,
        },
        connected: false,
      };
    }

    const { token, cloudId, accountId } = ctx;

    // --- Completed this week: from jira_transition logs (status → Done) ---
    const weekStart = format(
      startOfWeek(new Date(), { weekStartsOn: 1 }),
      "yyyy-MM-dd",
    );

    const transitionLogsResult = await this.db.query(
      `SELECT occurred_at, is_after_hours, is_weekend, metadata
       FROM raw_activity_logs
       WHERE user_id = $1 AND source = 'jira' AND event_type = 'jira_transition' AND occurred_at >= $2
       ORDER BY occurred_at DESC`,
      [userId, weekStart],
    );

    const completedThisWeek = transitionLogsResult.rows
      .filter((r) => r.metadata?.isCompleted === true)
      .map((r) => ({
        issueType: r.metadata.issueType ?? "Unknown",
        priority: r.metadata.priority ?? "Unknown",
        completedAt: r.occurred_at,
        afterHours: r.is_after_hours,
        weekend: r.is_weekend,
      }));

    const allTransitions = transitionLogsResult.rows;
    const velocity = {
      completedCount: completedThisWeek.length,
      afterHoursTransitions: allTransitions.filter((r) => r.is_after_hours)
        .length,
      weekendTransitions: allTransitions.filter((r) => r.is_weekend).length,
      totalTransitionsThisWeek: allTransitions.length,
    };

    // --- Workload counts: from today's jira_ticket_state snapshot ---
    const snapshotResult = await this.db.query(
      `SELECT is_after_hours, is_weekend, metadata
       FROM raw_activity_logs
       WHERE user_id = $1 AND source = 'jira' AND event_type = 'jira_ticket_state' AND occurred_at >= CURRENT_DATE`,
      [userId],
    );

    const snapshotRows = snapshotResult.rows;
    const afterHoursUpdates = snapshotRows.filter(
      (r) => r.metadata?.lastUpdatedAfterHours === true,
    ).length;
    const weekendUpdates = snapshotRows.filter(
      (r) => r.metadata?.lastUpdatedWeekend === true,
    ).length;
    const todoCount = snapshotRows.filter(
      (r) => r.metadata?.statusCategory === "To Do",
    ).length;
    const inProgressCount = snapshotRows.filter(
      (r) => r.metadata?.statusCategory === "In Progress",
    ).length;
    const doneTodayCount = snapshotRows.filter(
      (r) => r.metadata?.statusCategory === "Done",
    ).length;

    const workload = {
      todoCount,
      inProgressCount,
      completedThisWeekCount: Math.max(
        completedThisWeek.length,
        doneTodayCount,
      ),
      afterHoursUpdates,
      weekendUpdates,
    };

    // --- Live tickets from Jira API: TO DO + IN PROGRESS ---
    // Fetched live (titles never stored) — shown to the user about their own data
    const mapTicket = (issue: any): JiraTicket => ({
      key: issue.key,
      summary: issue.fields.summary ?? "",
      issueType: issue.fields.issuetype?.name ?? "Unknown",
      priority: issue.fields.priority?.name ?? "Unknown",
      status: issue.fields.status?.name ?? "Unknown",
      updatedAt: issue.fields.updated,
    });

    let toDo: JiraTicket[] = [];
    let inProgress: JiraTicket[] = [];

    try {
      const [toDoRes, inProgressRes] = await Promise.all([
        axios.get(
          `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            params: {
              jql: `assignee = "${accountId}" AND ${TODO_JQL_FILTER} ORDER BY priority ASC, updated DESC`,
              fields: "summary,status,priority,issuetype,updated",
              maxResults: 30,
            },
          },
        ),
        axios.get(
          `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            params: {
              jql: `assignee = "${accountId}" AND ${IN_PROGRESS_JQL_FILTER} ORDER BY updated DESC`,
              fields: "summary,status,priority,issuetype,updated",
              maxResults: 20,
            },
          },
        ),
      ]);

      toDo = (toDoRes.data.issues || []).map(mapTicket);
      inProgress = (inProgressRes.data.issues || []).map(mapTicket);
    } catch (err: any) {
      const detail = err.response?.data
        ? JSON.stringify(err.response.data)
        : err.message;
      this.logger.warn(
        `Failed to fetch live Jira tickets for user ${userId}: ${detail}`,
      );
    }

    return {
      completedThisWeek,
      toDo,
      inProgress,
      workload,
      velocity,
      connected: true,
    };
  }
}
