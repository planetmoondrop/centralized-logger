import { Controller, Get, Post, Patch, Param, Body, Query, HttpCode } from '@nestjs/common';
import { TicketsService, TicketStatus, TicketPriority } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  findAll(@Query('userId') userId?: string) {
    return this.tickets.findAll(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tickets.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      title: string;
      description: string;
      priority?: TicketPriority;
      userId: string;
    },
  ) {
    return this.tickets.create(body);
  }

  @Patch(':id/status')
  @HttpCode(200)
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: TicketStatus; assignedTo?: string },
  ) {
    return this.tickets.updateStatus(id, body.status, body.assignedTo);
  }
}
