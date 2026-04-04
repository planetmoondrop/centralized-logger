import { Injectable, UnauthorizedException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { LokiHttpService, LokiLoggerService, Log } from '@planetmoondrop/centralized-logger';

const AUTH_URL = `${process.env['AUTH_SERVICE_URL'] ?? 'http://localhost:3001'}/api/auth`;
const SUPPORT_URL = `${process.env['SUPPORT_SERVICE_URL'] ?? 'http://localhost:3002'}/api/tickets`;

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: string;
}

@Injectable()
export class GatewayService {
  constructor(
    private readonly http: LokiHttpService,
    private readonly logger: LokiLoggerService,
  ) { }

  @Log({ level: 'info' })
  async login(email: string, password: string) {
    const res = await firstValueFrom(
      this.http.post<{ token: string } & Session>(`${AUTH_URL}/login`, { email, password }),
    );
    return res.data;
  }

  @Log()
  async validateToken(authorization: string): Promise<Session> {
    try {
      const res = await firstValueFrom(
        this.http.get<Session>(`${AUTH_URL}/validate`, {
          headers: { authorization },
        }),
      );
      return res.data;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  @Log({ level: 'info' })
  async logout(authorization: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${AUTH_URL}/logout`, { headers: { authorization } }),
    ).catch(() => {
      this.logger.warn('Logout call to auth-service failed', 'GatewayService');
    });
  }

  @Log()
  async getTickets(userId?: string) {
    const params = userId ? { userId } : {};
    const res = await firstValueFrom(this.http.get(SUPPORT_URL, { params }));
    return res.data;
  }

  @Log()
  async getTicket(id: string) {
    const res = await firstValueFrom(this.http.get(`${SUPPORT_URL}/${id}`));
    return res.data;
  }

  @Log({ level: 'info' })
  async createTicket(dto: {
    title: string;
    description: string;
    priority?: string;
    userId: string;
  }) {
    const res = await firstValueFrom(this.http.post(SUPPORT_URL, dto));
    this.logger.event('gateway.ticket_created', { userId: dto.userId, priority: dto.priority });
    return res.data;
  }

  @Log({ level: 'info' })
  async updateTicketStatus(id: string, status: string, assignedTo?: string) {
    const res = await firstValueFrom(
      this.http.patch(`${SUPPORT_URL}/${id}/status`, { status, assignedTo }),
    );
    return res.data;
  }
}
