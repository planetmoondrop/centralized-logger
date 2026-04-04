import { Injectable, UnauthorizedException } from '@nestjs/common';
import { LokiLoggerService, Log } from '@planetmoondrop/centralized-logger';
import { v4 as uuidv4 } from 'uuid';

interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  role: 'admin' | 'agent' | 'customer';
}

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: string;
}

@Injectable()
export class AuthService {
  // Seed users — no DB needed for this example
  private readonly users: User[] = [
    {
      id: 'usr-001',
      email: 'admin@example.com',
      name: 'Admin User',
      password: 'password123',
      role: 'admin',
    },
    {
      id: 'usr-002',
      email: 'agent@example.com',
      name: 'Support Agent',
      password: 'password456',
      role: 'agent',
    },
    {
      id: 'usr-003',
      email: 'customer@example.com',
      name: 'Jane Customer',
      password: 'password789',
      role: 'customer',
    },
  ];

  // token → session (in-memory — restarts clear all sessions)
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly logger: LokiLoggerService) {}

  @Log({ level: 'info' })
  login(email: string, password: string): { token: string } & Session {
    const user = this.users.find(u => u.email === email && u.password === password);

    if (!user) {
      this.logger.warn(`Login failed — bad credentials for ${email}`, 'AuthService', { email });
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = uuidv4();
    const session: Session = { userId: user.id, email: user.email, name: user.name, role: user.role };
    this.sessions.set(token, session);

    this.logger.event('user.login', { userId: user.id, email: user.email, role: user.role });

    return { token, ...session };
  }

  @Log()
  validate(token: string): Session {
    const session = this.sessions.get(token);
    if (!session) {
      this.logger.warn('Token validation failed — token not found or expired', 'AuthService');
      throw new UnauthorizedException('Invalid or expired token');
    }
    return session;
  }

  @Log()
  logout(token: string): void {
    const session = this.sessions.get(token);
    if (session) {
      this.sessions.delete(token);
      this.logger.event('user.logout', { userId: session.userId, email: session.email });
    }
  }
}
