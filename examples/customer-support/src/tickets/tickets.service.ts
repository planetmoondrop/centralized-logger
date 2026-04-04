import { Injectable, NotFoundException } from '@nestjs/common';
import { LokiLoggerService, Log } from '@planetmoondrop/centralized-logger';
import { v4 as uuidv4 } from 'uuid';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  userId: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class TicketsService {
  private tickets: Ticket[] = [
    {
      id: 'tkt-001',
      title: 'Cannot reset password',
      description: 'The password reset email is not arriving.',
      status: 'open',
      priority: 'high',
      userId: 'usr-003',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      id: 'tkt-002',
      title: 'Billing charge incorrect',
      description: 'I was charged twice for my subscription this month.',
      status: 'in_progress',
      priority: 'critical',
      userId: 'usr-003',
      assignedTo: 'usr-002',
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'tkt-003',
      title: 'Feature request: dark mode',
      description: 'Would love a dark mode option in the settings.',
      status: 'open',
      priority: 'low',
      userId: 'usr-003',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ];

  constructor(private readonly logger: LokiLoggerService) { }

  @Log()
  findAll(userId?: string): Ticket[] {
    const result = userId ? this.tickets.filter(t => t.userId === userId) : this.tickets;
    this.logger.log(`Fetched ${result.length} tickets`, 'TicketsService', { userId, count: result.length });
    return result;
  }

  @Log()
  findOne(id: string): Ticket {
    const ticket = this.tickets.find(t => t.id === id);
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }

  @Log({ level: 'info' })
  create(dto: { title: string; description: string; priority?: TicketPriority; userId: string }): Ticket {
    const ticket: Ticket = {
      id: `tkt-${uuidv4().slice(0, 8)}`,
      title: dto.title,
      description: dto.description,
      status: 'open',
      priority: dto.priority ?? 'medium',
      userId: dto.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.tickets.push(ticket);
    this.logger.event('ticket.created', { ticketId: ticket.id, userId: ticket.userId, priority: ticket.priority });
    return ticket;
  }

  @Log({ level: 'info' })
  updateStatus(id: string, status: TicketStatus, assignedTo?: string): Ticket {
    const ticket = this.findOne(id);
    const previous = ticket.status;
    ticket.status = status;
    ticket.updatedAt = new Date().toISOString();
    if (assignedTo) ticket.assignedTo = assignedTo;

    this.logger.event('ticket.status_changed', {
      ticketId: id,
      from: previous,
      to: status,
      assignedTo,
    });
    return ticket;
  }
}
