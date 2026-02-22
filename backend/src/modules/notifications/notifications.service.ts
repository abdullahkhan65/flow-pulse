import { Injectable, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { DATABASE_POOL } from '../../database/database.module';
import { format, subWeeks, startOfWeek } from 'date-fns';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    @Inject(DATABASE_POOL) private db: Pool,
    private configService: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: configService.get('email.host'),
      port: configService.get('email.port'),
      secure: true,
      auth: {
        user: configService.get('email.user'),
        pass: configService.get('email.pass'),
      },
    });
  }

  async sendWeeklyDigests() {
    const lastWeekStart = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
    const weekStr = format(lastWeekStart, 'yyyy-MM-dd');

    // Get managers/admins who have weekly digest enabled
    const result = await this.db.query(
      `SELECT u.id, u.email, u.name, u.organization_id, o.name as org_name,
              np.weekly_digest_email
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       JOIN notification_preferences np ON np.user_id = u.id
       WHERE u.role IN ('owner', 'admin', 'manager')
         AND np.weekly_digest_email = true
         AND u.is_active = true`,
    );

    for (const manager of result.rows) {
      const teamData = await this.getTeamSummaryForManager(manager.organization_id, weekStr);
      if (!teamData) continue;

      await this.sendEmail({
        to: manager.email,
        subject: `FlowPulse Weekly Digest — Week of ${format(lastWeekStart, 'MMM d, yyyy')}`,
        html: generateDigestEmail(manager, teamData, lastWeekStart),
      }).catch((err) => {
        this.logger.error(`Failed to send digest to ${manager.email}: ${err.message}`);
      });
    }
  }

  async sendBurnoutAlerts() {
    const latestWeekResult = await this.db.query(
      `SELECT DISTINCT week_start FROM weekly_scores ORDER BY week_start DESC LIMIT 1`,
    );
    if (!latestWeekResult.rows[0]) return;

    const latestWeek = latestWeekResult.rows[0].week_start;

    // Find users at high/critical risk
    const atRiskResult = await this.db.query(
      `SELECT ws.user_id, ws.burnout_risk_score, ws.burnout_risk_delta,
              ws.score_breakdown, u.organization_id, u.email, u.name
       FROM weekly_scores ws
       JOIN users u ON u.id = ws.user_id
       WHERE ws.week_start = $1
         AND ws.burnout_risk_score >= 70
       ORDER BY ws.burnout_risk_score DESC`,
      [latestWeek],
    );

    for (const atRisk of atRiskResult.rows) {
      // Notify org admins/managers (not the at-risk user themselves — privacy)
      const managersResult = await this.db.query(
        `SELECT u.email, u.name, np.burnout_alert_email, np.alert_threshold
         FROM users u
         JOIN notification_preferences np ON np.user_id = u.id
         WHERE u.organization_id = $1
           AND u.role IN ('owner', 'admin', 'manager')
           AND np.burnout_alert_email = true
           AND np.alert_threshold <= $2
           AND u.is_active = true`,
        [atRisk.organization_id, Math.round(atRisk.burnout_risk_score)],
      );

      for (const manager of managersResult.rows) {
        await this.sendEmail({
          to: manager.email,
          subject: `FlowPulse Alert: Team member showing burnout risk signals`,
          html: generateAlertEmail(manager, atRisk),
        }).catch((err) => {
          this.logger.error(`Failed to send alert to ${manager.email}: ${err.message}`);
        });
      }
    }
  }

  private async getTeamSummaryForManager(orgId: string, weekStart: string) {
    const result = await this.db.query(
      `SELECT * FROM team_weekly_scores WHERE organization_id = $1 AND week_start = $2`,
      [orgId, weekStart],
    );
    return result.rows[0] || null;
  }

  private async sendEmail(options: { to: string; subject: string; html: string }) {
    await this.transporter.sendMail({
      from: this.configService.get('email.from'),
      ...options,
    });
  }
}

function generateDigestEmail(manager: any, teamData: any, weekStart: Date): string {
  const riskColor = teamData.avg_burnout_risk_score >= 70 ? '#EF4444' :
                    teamData.avg_burnout_risk_score >= 50 ? '#F59E0B' : '#10B981';
  return `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111827;">
  <div style="border-bottom: 2px solid #6366F1; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="margin: 0; font-size: 24px; color: #6366F1;">FlowPulse</h1>
    <p style="margin: 4px 0 0; color: #6B7280;">Weekly Team Health Digest</p>
    <p style="margin: 4px 0 0; color: #6B7280; font-size: 14px;">Week of ${format(weekStart, 'MMMM d, yyyy')}</p>
  </div>

  <p style="margin-bottom: 24px;">Hi ${manager.name?.split(' ')[0] || 'there'},</p>

  <div style="background: #F9FAFB; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 16px; font-size: 16px;">Team Overview</h2>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
      <div>
        <span style="font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em;">Burnout Risk</span>
        <div style="font-size: 28px; font-weight: 700; color: ${riskColor};">${Math.round(teamData.avg_burnout_risk_score)}<span style="font-size: 14px; font-weight: 400;">/100</span></div>
      </div>
      <div>
        <span style="font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em;">Members at Risk</span>
        <div style="font-size: 28px; font-weight: 700; color: #111827;">${teamData.members_at_risk}<span style="font-size: 14px; font-weight: 400;"> / ${teamData.total_members}</span></div>
      </div>
    </div>
  </div>

  ${teamData.insights?.length > 0 ? `
  <h2 style="font-size: 16px; margin-bottom: 12px;">Key Insights</h2>
  <ul style="padding-left: 20px; margin-bottom: 24px;">
    ${teamData.insights.map((i: any) => `<li style="margin-bottom: 8px;">${i.text}<br><span style="color: #6B7280; font-size: 14px;">${i.recommendation}</span></li>`).join('')}
  </ul>
  ` : ''}

  <p style="font-size: 13px; color: #6B7280; border-top: 1px solid #E5E7EB; padding-top: 16px; margin-top: 24px;">
    This digest shows <strong>team-level aggregate metrics only</strong>. No individual performance data is shared. Data collected: meeting counts, Slack message counts, and work hours — never message content.
    <br><br>
    <a href="${process.env.FRONTEND_URL}/dashboard" style="color: #6366F1;">View full dashboard →</a>
  </p>
</body>
</html>`;
}

function generateAlertEmail(manager: any, atRisk: any): string {
  const breakdown = atRisk.score_breakdown || {};
  const flags = breakdown.riskFlags || [];
  return `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #111827;">
  <div style="background: #FEF2F2; border-left: 4px solid #EF4444; padding: 16px; border-radius: 4px; margin-bottom: 24px;">
    <h2 style="margin: 0; font-size: 16px; color: #991B1B;">Burnout Risk Alert</h2>
    <p style="margin: 8px 0 0; color: #7F1D1D; font-size: 14px;">A team member is showing elevated stress signals (risk score: ${Math.round(atRisk.burnout_risk_score)}/100)</p>
  </div>

  <p>Hi ${manager.name?.split(' ')[0] || 'there'},</p>
  <p>FlowPulse has detected elevated burnout risk signals for a member of your team. This is based on objective work pattern data — not performance judgment.</p>

  <p><strong>What we detected:</strong></p>
  <ul>
    ${flags.map((f: string) => `<li>${f}</li>`).join('') || '<li>Multiple stress indicators exceeding threshold</li>'}
  </ul>

  <p><strong>What this means:</strong> These are patterns worth a conversation — a quick 1:1 check-in about workload can go a long way.</p>

  <p style="font-size: 13px; color: #6B7280; border-top: 1px solid #E5E7EB; padding-top: 16px; margin-top: 24px;">
    FlowPulse does not share which individual triggered this alert with anyone outside your organization. No message content is ever stored or analyzed.
    <br><br>
    <a href="${process.env.FRONTEND_URL}/dashboard" style="color: #6366F1;">View team dashboard →</a>
  </p>
</body>
</html>`;
}
