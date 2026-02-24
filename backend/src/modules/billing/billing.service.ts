import { Injectable, Inject, Logger, ForbiddenException } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { DATABASE_POOL } from '../../database/database.module';

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

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: Stripe;

  constructor(
    @Inject(DATABASE_POOL) private db: Pool,
    private configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('stripe.secretKey');
    if (secretKey) {
      this.stripe = new Stripe(secretKey, { apiVersion: '2026-01-28.clover' });
    }
  }

  async getBillingStatus(orgId: string): Promise<BillingStatus> {
    const result = await this.db.query(
      `SELECT
         bs.status, bs.seats, bs.current_period_end, bs.cancel_at_period_end,
         o.plan, o.trial_ends_at, o.seat_limit,
         COUNT(u.id) FILTER (WHERE u.is_active = true) as active_seats
       FROM organizations o
       LEFT JOIN billing_subscriptions bs ON bs.organization_id = o.id
       LEFT JOIN users u ON u.organization_id = o.id
       WHERE o.id = $1
       GROUP BY bs.status, bs.seats, bs.current_period_end, bs.cancel_at_period_end,
                o.plan, o.trial_ends_at, o.seat_limit`,
      [orgId],
    );

    const row = result.rows[0];
    if (!row) {
      return { status: 'none', plan: 'free', seats: 4, activeSeats: 0, trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, daysLeftInTrial: null };
    }

    const trialEndsAt = row.trial_ends_at ? new Date(row.trial_ends_at).toISOString() : null;
    let daysLeftInTrial: number | null = null;
    if (trialEndsAt) {
      const ms = new Date(trialEndsAt).getTime() - Date.now();
      daysLeftInTrial = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
    }

    return {
      status: row.status || 'trialing',
      plan: row.plan || 'free',
      seats: row.seats || row.seat_limit || 4,
      activeSeats: parseInt(row.active_seats) || 0,
      trialEndsAt,
      currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end).toISOString() : null,
      cancelAtPeriodEnd: row.cancel_at_period_end || false,
      daysLeftInTrial,
    };
  }

  async checkAccess(orgId: string): Promise<{ allowed: boolean; reason?: string }> {
    const status = await this.getBillingStatus(orgId);

    if (status.status === 'active') return { allowed: true };

    if (status.status === 'trialing') {
      const isExpired = status.trialEndsAt && new Date(status.trialEndsAt) < new Date();
      if (isExpired) return { allowed: false, reason: 'trial_expired' };
      if (status.activeSeats >= status.seats) return { allowed: false, reason: 'seat_limit' };
      return { allowed: true };
    }

    if (status.status === 'past_due') {
      // Grace period: allow access but show warning
      return { allowed: true };
    }

    return { allowed: false, reason: 'no_subscription' };
  }

  async createCheckoutSession(orgId: string, seats: number): Promise<{ url: string }> {
    if (!this.stripe) throw new ForbiddenException('Stripe not configured');

    const orgResult = await this.db.query(
      `SELECT o.billing_email, o.name, o.stripe_customer_id
       FROM organizations o WHERE o.id = $1`,
      [orgId],
    );
    const org = orgResult.rows[0];
    if (!org) throw new ForbiddenException('Organization not found');

    let customerId = org.stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: org.billing_email,
        name: org.name,
        metadata: { organization_id: orgId },
      });
      customerId = customer.id;
      await this.db.query(
        `UPDATE organizations SET stripe_customer_id = $1 WHERE id = $2`,
        [customerId, orgId],
      );
    }

    const frontendUrl = this.configService.get<string>('frontendUrl', 'http://localhost:3000');
    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: this.configService.get<string>('stripe.priceId'),
          quantity: seats,
        },
      ],
      success_url: `${frontendUrl}/dashboard/settings?billing=success`,
      cancel_url: `${frontendUrl}/dashboard/settings?billing=canceled`,
      metadata: { organization_id: orgId, seats: String(seats) },
    });

    return { url: session.url! };
  }

  async getBillingPortalUrl(orgId: string): Promise<{ url: string }> {
    if (!this.stripe) throw new ForbiddenException('Stripe not configured');

    const orgResult = await this.db.query(
      `SELECT stripe_customer_id FROM organizations WHERE id = $1`,
      [orgId],
    );
    const customerId = orgResult.rows[0]?.stripe_customer_id;
    if (!customerId) throw new ForbiddenException('No billing customer found. Please subscribe first.');

    const frontendUrl = this.configService.get<string>('frontendUrl', 'http://localhost:3000');
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${frontendUrl}/dashboard/settings`,
    });

    return { url: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    if (!this.stripe) return;

    const webhookSecret = this.configService.get<string>('stripe.webhookSecret');
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret!);
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      throw err;
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        // Stripe v20: Stripe.Checkout.Session (not Stripe.CheckoutSession)
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.organization_id;
        const seats = parseInt(session.metadata?.seats || '4');
        if (orgId && session.subscription) {
          await this.activateSubscription(orgId, session.subscription as string, seats);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = await this.getOrgIdByCustomer(sub.customer as string);
        if (orgId) await this.updateSubscription(orgId, sub);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = await this.getOrgIdByCustomer(sub.customer as string);
        if (orgId) {
          await this.db.query(
            `UPDATE billing_subscriptions SET status = 'canceled', updated_at = NOW()
             WHERE organization_id = $1`,
            [orgId],
          );
          await this.db.query(
            `UPDATE organizations SET plan = 'free' WHERE id = $1`,
            [orgId],
          );
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const orgId = await this.getOrgIdByCustomer(invoice.customer as string);
        if (orgId) {
          await this.db.query(
            `UPDATE billing_subscriptions SET status = 'past_due', updated_at = NOW()
             WHERE organization_id = $1`,
            [orgId],
          );
        }
        break;
      }
    }
  }

  private async activateSubscription(orgId: string, subscriptionId: string, seats: number) {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    // In Stripe API v2026-01-28.clover, current_period_end moved to SubscriptionItem
    const periodEnd = sub.items.data[0]?.current_period_end;
    await this.db.query(
      `INSERT INTO billing_subscriptions
         (organization_id, stripe_subscription_id, stripe_price_id, status, seats, current_period_end, cancel_at_period_end)
       VALUES ($1, $2, $3, 'active', $4, $5, false)
       ON CONFLICT (organization_id) DO UPDATE SET
         stripe_subscription_id = EXCLUDED.stripe_subscription_id,
         status = 'active',
         seats = EXCLUDED.seats,
         current_period_end = EXCLUDED.current_period_end,
         updated_at = NOW()`,
      [
        orgId,
        subscriptionId,
        sub.items.data[0]?.price?.id || null,
        seats,
        periodEnd ? new Date(periodEnd * 1000) : null,
      ],
    );
    await this.db.query(
      `UPDATE organizations SET plan = 'pro', seat_limit = $1 WHERE id = $2`,
      [seats, orgId],
    );
  }

  private async updateSubscription(orgId: string, sub: Stripe.Subscription) {
    const seats = sub.items.data[0]?.quantity || 4;
    // In Stripe API v2026-01-28.clover, current_period_end moved to SubscriptionItem
    const periodEnd = sub.items.data[0]?.current_period_end;
    await this.db.query(
      `UPDATE billing_subscriptions
       SET status = $1, seats = $2, current_period_end = $3, cancel_at_period_end = $4, updated_at = NOW()
       WHERE organization_id = $5`,
      [
        sub.status,
        seats,
        periodEnd ? new Date(periodEnd * 1000) : null,
        sub.cancel_at_period_end,
        orgId,
      ],
    );
    await this.db.query(
      `UPDATE organizations SET seat_limit = $1 WHERE id = $2`,
      [seats, orgId],
    );
  }

  private async getOrgIdByCustomer(customerId: string): Promise<string | null> {
    const result = await this.db.query(
      `SELECT id FROM organizations WHERE stripe_customer_id = $1`,
      [customerId],
    );
    return result.rows[0]?.id || null;
  }
}
