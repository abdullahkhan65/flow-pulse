import {
  Controller, Get, Post, Body, Req, Res, UseGuards, RawBodyRequest,
  HttpCode, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get billing status for the current organization' })
  getBillingStatus(@CurrentUser() user: JwtPayload) {
    return this.billingService.getBillingStatus(user.organizationId);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Stripe checkout session' })
  createCheckoutSession(
    @CurrentUser() user: JwtPayload,
    @Body() body: { seats: number },
  ) {
    const seats = Math.max(1, Math.min(1000, body.seats || 4));
    return this.billingService.createCheckoutSession(user.organizationId, seats);
  }

  @Get('portal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Stripe billing portal URL' })
  getBillingPortal(@CurrentUser() user: JwtPayload) {
    return this.billingService.getBillingPortalUrl(user.organizationId);
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stripe webhook handler (no auth — signature verified internally)' })
  async handleWebhook(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) throw new BadRequestException('Missing stripe-signature header');

    try {
      await this.billingService.handleWebhook(req.rawBody!, signature);
      res.json({ received: true });
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
}
