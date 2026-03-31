import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
} from '@nestjs/common';
import { GatewayService } from './gateway.service';

@Controller()
export class GatewayController {
  constructor(private readonly gateway: GatewayService) {}

  // ── Auth endpoints ──────────────────────────────────────────────────────────

  @Post('auth/login')
  @HttpCode(200)
  login(@Body() body: { email: string; password: string }) {
    return this.gateway.login(body.email, body.password);
  }

  @Get('auth/validate')
  validate(@Headers('authorization') authorization: string) {
    return this.gateway.validateToken(authorization);
  }

  @Delete('auth/logout')
  @HttpCode(204)
  logout(@Headers('authorization') authorization: string) {
    return this.gateway.logout(authorization);
  }

  // ── Ticket endpoints ────────────────────────────────────────────────────────

  @Get('tickets')
  getTickets(@Query('userId') userId?: string) {
    return this.gateway.getTickets(userId);
  }

  @Get('tickets/:id')
  getTicket(@Param('id') id: string) {
    return this.gateway.getTicket(id);
  }

  @Post('tickets')
  createTicket(
    @Body()
    body: {
      title: string;
      description: string;
      priority?: string;
      userId: string;
    },
  ) {
    return this.gateway.createTicket(body);
  }

  @Patch('tickets/:id/status')
  @HttpCode(200)
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string; assignedTo?: string },
  ) {
    return this.gateway.updateTicketStatus(id, body.status, body.assignedTo);
  }
}
