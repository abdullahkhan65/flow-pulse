import { Injectable, Inject, Logger } from "@nestjs/common";
import { Pool } from "pg";
import { ConfigService } from "@nestjs/config";
import { Octokit } from "@octokit/rest";
import { DATABASE_POOL } from "../../../database/database.module";
import { encrypt, decrypt } from "../../../common/utils/encryption";
import { subDays } from "date-fns";
import * as crypto from "crypto";

interface NormalizedGithubEvent {
  userId: string;
  organizationId: string;
  source: "github";
  eventType: "commit_pushed" | "pr_created" | "pr_reviewed" | "issue_commented";
  occurredAt: Date;
  isAfterHours: boolean;
  isWeekend: boolean;
  metadata: {
    repoId: number;
    repoFullName: string;
    eventAction: string;
    isPrReview: boolean;
  };
}

interface GithubSyncSettings {
  timeWindowDays: number;
  repoAllowlist: string[];
}

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(
    @Inject(DATABASE_POOL) private db: Pool,
    private configService: ConfigService,
  ) {}

  private getSyncSettings(metadata: any): GithubSyncSettings {
    const defaults: GithubSyncSettings = {
      timeWindowDays: 14,
      repoAllowlist: [],
    };
    const raw = metadata?.githubSync || {};
    const timeWindowDays = [7, 14, 30].includes(raw.timeWindowDays)
      ? raw.timeWindowDays
      : defaults.timeWindowDays;
    const repoAllowlist = Array.isArray(raw.repoAllowlist)
      ? raw.repoAllowlist
          .map((r: string) => String(r).trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 100)
      : [];
    return { timeWindowDays, repoAllowlist };
  }

  private parseWorkHour(
    value: string | number | undefined,
    fallback: number,
  ): number {
    if (typeof value === "number" && Number.isFinite(value))
      return Math.max(0, Math.min(23, value));
    if (typeof value === "string") {
      const first = value.split(":")[0];
      const parsed = parseInt(first, 10);
      if (Number.isFinite(parsed)) return Math.max(0, Math.min(23, parsed));
    }
    return fallback;
  }

  private getHourAndWeekdayInTimezone(
    date: Date,
    timeZone: string,
  ): { hour: number; weekday: number } {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hour12: false,
      weekday: "short",
    });
    const parts = formatter.formatToParts(date);
    const hour = parseInt(
      parts.find((p) => p.type === "hour")?.value || "0",
      10,
    );
    const weekdayStr = parts.find((p) => p.type === "weekday")?.value || "Mon";
    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return { hour, weekday: weekdayMap[weekdayStr] ?? 1 };
  }

  private isRepoAllowed(allowlist: string[], repoFullName: string): boolean {
    if (allowlist.length === 0) return true;
    const normalized = repoFullName.toLowerCase();
    const nameOnly = normalized.split("/").pop() || "";
    return allowlist.some(
      (entry) =>
        entry === normalized ||
        entry === nameOnly ||
        normalized.endsWith(`/${entry}`),
    );
  }

  private pushUniqueEvent(
    events: NormalizedGithubEvent[],
    seen: Set<string>,
    event: NormalizedGithubEvent,
  ) {
    const k = `${event.eventType}|${event.metadata.repoId}|${event.occurredAt.toISOString()}|${event.metadata.eventAction}`;
    if (seen.has(k)) return;
    seen.add(k);
    events.push(event);
  }

  private encodeState(payload: {
    userId: string;
    orgId: string;
    ts: number;
    nonce: string;
  }): string {
    return Buffer.from(JSON.stringify(payload)).toString("base64url");
  }

  private signState(encodedState: string): string {
    const secret =
      this.configService.get<string>("jwt.secret") ||
      this.configService.get<string>("encryption.key")!;
    return crypto
      .createHmac("sha256", secret)
      .update(encodedState)
      .digest("base64url");
  }

  getOAuthUrl(statePayload?: { userId: string; orgId: string }): string {
    const clientId = this.configService.get<string>("github.clientId");
    const callbackUrl = this.configService.get<string>("github.callbackUrl");
    const scope = "read:user,repo";
    const base = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl!)}&scope=${scope}`;

    if (!statePayload) return base;

    const encodedState = this.encodeState({
      userId: statePayload.userId,
      orgId: statePayload.orgId,
      ts: Date.now(),
      nonce: crypto.randomBytes(12).toString("hex"),
    });
    const signature = this.signState(encodedState);
    const state = `${encodedState}.${signature}`;
    return `${base}&state=${encodeURIComponent(state)}`;
  }

  parseAndValidateState(
    state: string,
  ): { userId: string; orgId: string } | null {
    if (!state || !state.includes(".")) return null;
    const [encodedState, signature] = state.split(".");
    if (!encodedState || !signature) return null;

    const expectedSig = this.signState(encodedState);
    const provided = Buffer.from(signature);
    const expected = Buffer.from(expectedSig);
    if (
      provided.length !== expected.length ||
      !crypto.timingSafeEqual(provided, expected)
    )
      return null;

    try {
      const payload = JSON.parse(
        Buffer.from(encodedState, "base64url").toString("utf8"),
      ) as {
        userId: string;
        orgId: string;
        ts: number;
      };
      if (!payload.userId || !payload.orgId || !payload.ts) return null;
      if (Date.now() - payload.ts > 15 * 60 * 1000) return null;
      return { userId: payload.userId, orgId: payload.orgId };
    } catch {
      return null;
    }
  }

  async handleCallback(
    userId: string,
    orgId: string,
    code: string,
  ): Promise<void> {
    const clientId = this.configService.get<string>("github.clientId");
    const clientSecret = this.configService.get<string>("github.clientSecret");

    // Exchange code for token
    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      },
    );

    const data = (await response.json()) as any;
    if (!data.access_token)
      throw new Error("GitHub OAuth failed: no access token returned");

    const encKey = this.configService.get<string>("encryption.key")!;
    const encToken = encrypt(data.access_token, encKey);

    // Get GitHub user info for metadata
    const octokit = new Octokit({ auth: data.access_token });
    const { data: ghUser } = await octokit.users.getAuthenticated();

    await this.db.query(
      `INSERT INTO integrations (organization_id, user_id, type, access_token, status, metadata)
       VALUES ($1, $2, 'github', $3, 'active', $4)
       ON CONFLICT (user_id, type) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         status = 'active',
         metadata = COALESCE(integrations.metadata, '{}'::jsonb) || EXCLUDED.metadata,
         updated_at = NOW()`,
      [
        orgId,
        userId,
        encToken,
        JSON.stringify({ githubLogin: ghUser.login, githubId: ghUser.id }),
      ],
    );
  }

  async updateSyncSettings(
    userId: string,
    settings: GithubSyncSettings,
  ): Promise<void> {
    const normalized: GithubSyncSettings = {
      timeWindowDays: [7, 14, 30].includes(settings.timeWindowDays)
        ? settings.timeWindowDays
        : 14,
      repoAllowlist: (settings.repoAllowlist || [])
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 100),
    };

    await this.db.query(
      `UPDATE integrations
       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{githubSync}', $2::jsonb, true),
           updated_at = NOW()
       WHERE user_id = $1 AND type = 'github'`,
      [userId, JSON.stringify(normalized)],
    );
  }

  async syncUserActivity(
    userId: string,
    orgId: string,
  ): Promise<{ synced: number }> {
    const tokenResult = await this.db.query(
      `SELECT i.access_token, i.metadata, o.settings, u.timezone AS user_timezone
       FROM integrations i
       JOIN organizations o ON o.id = i.organization_id
       JOIN users u ON u.id = i.user_id
       WHERE i.user_id = $1 AND i.type = 'github' AND i.status = 'active'`,
      [userId],
    );

    if (!tokenResult.rows[0]) return { synced: 0 };

    const encKey = this.configService.get<string>("encryption.key")!;
    const row = tokenResult.rows[0];
    const token = decrypt(row.access_token, encKey);
    const orgSettings = row.settings || {};
    const settings = this.getSyncSettings(row.metadata);
    const workStart = this.parseWorkHour(orgSettings.workdayStart, 9);
    const workEnd = this.parseWorkHour(orgSettings.workdayEnd, 18);
    const timeZone = row.user_timezone || orgSettings.timezone || "UTC";

    const octokit = new Octokit({ auth: token });
    const events: NormalizedGithubEvent[] = [];
    const seenEvents = new Set<string>();
    const cutoff = subDays(new Date(), settings.timeWindowDays);

    try {
      const { data: ghUser } = await octokit.users.getAuthenticated();
      const eventsResult =
        await octokit.activity.listEventsForAuthenticatedUser({
          username: ghUser.login,
          per_page: 100,
        });

      for (const event of eventsResult.data) {
        const occurredAt = new Date(event.created_at!);
        if (occurredAt < cutoff) continue;

        const { hour, weekday } = this.getHourAndWeekdayInTimezone(
          occurredAt,
          timeZone,
        );
        const isAfterHours = hour < workStart || hour >= workEnd;
        const isWeekend = [0, 6].includes(weekday);
        const repoFullName = ((event.repo as any)?.name || "").toLowerCase();
        if (!this.isRepoAllowed(settings.repoAllowlist, repoFullName)) continue;

        let eventType: NormalizedGithubEvent["eventType"] | null = null;
        let eventAction = event.type || "";

        if (event.type === "PushEvent") {
          eventType = "commit_pushed";
        } else if (event.type === "PullRequestEvent") {
          eventType = "pr_created";
          eventAction = (event.payload as any)?.action || "opened";
        } else if (event.type === "PullRequestReviewEvent") {
          eventType = "pr_reviewed";
        } else if (
          event.type === "IssueCommentEvent" ||
          event.type === "PullRequestReviewCommentEvent"
        ) {
          eventType = "issue_commented";
        }

        if (!eventType) continue;

        this.pushUniqueEvent(events, seenEvents, {
          userId,
          organizationId: orgId,
          source: "github",
          eventType,
          occurredAt,
          isAfterHours,
          isWeekend,
          metadata: {
            repoId: (event.repo as any)?.id || 0, // repo ID only, no name
            repoFullName,
            eventAction,
            isPrReview: event.type === "PullRequestReviewEvent",
          },
        });
      }

      // More reliable source for engineering teams: query allowlisted repos directly.
      // This avoids missing data when the global activity feed is incomplete.
      let reposToQuery: Array<{ id: number; full_name: string }> = [];
      if (settings.repoAllowlist.length > 0) {
        const resolvedRepos = new Map<string, number>();
        const reposRes = await octokit.repos.listForAuthenticatedUser({
          affiliation: "owner,collaborator,organization_member",
          per_page: 100,
        });
        for (const r of reposRes.data as any[]) {
          const fullName = (r.full_name || "").toLowerCase();
          if (this.isRepoAllowed(settings.repoAllowlist, fullName)) {
            resolvedRepos.set(fullName, r.id);
          }
        }

        // If allowlist has explicit owner/repo entries not returned above, resolve directly.
        for (const entry of settings.repoAllowlist) {
          if (!entry.includes("/")) continue;
          const full = entry.toLowerCase();
          if (resolvedRepos.has(full)) continue;
          const [owner, repo] = full.split("/");
          if (!owner || !repo) continue;
          try {
            const repoRes = await octokit.repos.get({ owner, repo });
            resolvedRepos.set(full, repoRes.data.id);
          } catch {
            // Keep sync resilient even if one allowlisted repo is inaccessible.
          }
        }

        reposToQuery = Array.from(resolvedRepos.entries()).map(
          ([full_name, id]) => ({ id, full_name }),
        );
      }

      for (const repo of reposToQuery) {
        const [owner, repoName] = repo.full_name.split("/");
        if (!owner || !repoName) continue;

        const commitsRes = await octokit.repos.listCommits({
          owner,
          repo: repoName,
          author: ghUser.login,
          since: cutoff.toISOString(),
          per_page: 100,
        });
        for (const commit of commitsRes.data) {
          const commitDate =
            (commit.commit?.author as any)?.date ||
            (commit.commit?.committer as any)?.date;
          if (!commitDate) continue;
          const occurredAt = new Date(commitDate);
          if (occurredAt < cutoff) continue;
          const { hour, weekday } = this.getHourAndWeekdayInTimezone(
            occurredAt,
            timeZone,
          );
          this.pushUniqueEvent(events, seenEvents, {
            userId,
            organizationId: orgId,
            source: "github",
            eventType: "commit_pushed",
            occurredAt,
            isAfterHours: hour < workStart || hour >= workEnd,
            isWeekend: [0, 6].includes(weekday),
            metadata: {
              repoId: repo.id,
              repoFullName: repo.full_name,
              eventAction: "commit",
              isPrReview: false,
            },
          });
        }

        const pullsRes = await octokit.pulls.list({
          owner,
          repo: repoName,
          state: "all",
          sort: "updated",
          direction: "desc",
          per_page: 100,
        });

        for (const pr of pullsRes.data) {
          if (
            (pr.user?.login || "").toLowerCase() !== ghUser.login.toLowerCase()
          )
            continue;
          const createdAt = new Date(pr.created_at);
          if (createdAt >= cutoff) {
            const { hour, weekday } = this.getHourAndWeekdayInTimezone(
              createdAt,
              timeZone,
            );
            this.pushUniqueEvent(events, seenEvents, {
              userId,
              organizationId: orgId,
              source: "github",
              eventType: "pr_created",
              occurredAt: createdAt,
              isAfterHours: hour < workStart || hour >= workEnd,
              isWeekend: [0, 6].includes(weekday),
              metadata: {
                repoId: repo.id,
                repoFullName: repo.full_name,
                eventAction: "opened",
                isPrReview: false,
              },
            });
          }

          const reviewsRes = await octokit.pulls.listReviews({
            owner,
            repo: repoName,
            pull_number: pr.number,
            per_page: 100,
          });
          for (const review of reviewsRes.data) {
            if (
              (review.user?.login || "").toLowerCase() !==
              ghUser.login.toLowerCase()
            )
              continue;
            if (!review.submitted_at) continue;
            const occurredAt = new Date(review.submitted_at);
            if (occurredAt < cutoff) continue;
            const { hour, weekday } = this.getHourAndWeekdayInTimezone(
              occurredAt,
              timeZone,
            );
            this.pushUniqueEvent(events, seenEvents, {
              userId,
              organizationId: orgId,
              source: "github",
              eventType: "pr_reviewed",
              occurredAt,
              isAfterHours: hour < workStart || hour >= workEnd,
              isWeekend: [0, 6].includes(weekday),
              metadata: {
                repoId: repo.id,
                repoFullName: repo.full_name,
                eventAction: review.state || "reviewed",
                isPrReview: true,
              },
            });
          }
        }
      }
    } catch (err) {
      this.logger.error(`GitHub sync error for user ${userId}: ${err.message}`);
      await this.db.query(
        `UPDATE integrations SET status = 'error', error_message = $1 WHERE user_id = $2 AND type = 'github'`,
        [err.message, userId],
      );
      return { synced: 0 };
    }

    if (events.length === 0) {
      await this.db.query(
        `UPDATE integrations SET last_synced_at = NOW() WHERE user_id = $1 AND type = 'github'`,
        [userId],
      );
      return { synced: 0 };
    }

    // Delete and re-insert
    await this.db.query(
      `DELETE FROM raw_activity_logs WHERE user_id = $1 AND source = 'github' AND occurred_at >= $2`,
      [userId, cutoff],
    );

    const values = events
      .map((_, i) => {
        const b = i * 9;
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`;
      })
      .join(",");

    const params: any[] = [];
    for (const e of events) {
      params.push(
        e.organizationId,
        e.userId,
        e.source,
        e.eventType,
        e.occurredAt,
        e.isAfterHours,
        e.isWeekend,
        false,
        JSON.stringify(e.metadata),
      );
    }

    await this.db.query(
      `INSERT INTO raw_activity_logs (organization_id, user_id, source, event_type, occurred_at, is_after_hours, is_weekend, is_recurring, metadata)
       VALUES ${values} ON CONFLICT DO NOTHING`,
      params,
    );

    await this.db.query(
      `UPDATE integrations SET last_synced_at = NOW(), status = 'active' WHERE user_id = $1 AND type = 'github'`,
      [userId],
    );

    return { synced: events.length };
  }

  async getDebugStatus(userId: string) {
    const result = await this.db.query(
      `SELECT
         i.status,
         i.error_message,
         i.last_synced_at,
         i.metadata,
         COALESCE(COUNT(r.id), 0) AS github_events_last_14d
       FROM integrations i
       LEFT JOIN raw_activity_logs r
         ON r.user_id = i.user_id
        AND r.source = 'github'
        AND r.occurred_at >= NOW() - INTERVAL '14 days'
       WHERE i.user_id = $1 AND i.type = 'github'
       GROUP BY i.status, i.error_message, i.last_synced_at, i.metadata`,
      [userId],
    );
    return result.rows[0] || null;
  }
}
