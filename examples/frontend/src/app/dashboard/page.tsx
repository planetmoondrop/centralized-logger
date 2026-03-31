'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, authHeader, TRACE_VIEWER } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useActivityLog } from '@/hooks/useActivityLog';

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string;
  userId: string;
}

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'closed'] as const;

export default function DashboardPage() {
  const router = useRouter();
  const { token, user, logout, isLoggedIn } = useAuth();
  const { entries, log } = useActivityLog();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');

  // Redirect if not logged in
  useEffect(() => {
    if (!isLoggedIn) router.replace('/login');
  }, [isLoggedIn, router]);

  function captureTrace(headers: Record<string, string>) {
    const tid = headers?.['x-loki-trace-id'];
    if (tid) {
      setTraceId(tid);
      log(`trace-id: ${tid}`, 'trace');
    }
  }

  const loadTickets = useCallback(async () => {
    if (!token || !user) return;
    try {
      const res = await api.get('/tickets', {
        headers: authHeader(token),
        params: user.role === 'customer' ? { userId: user.userId } : {},
      });
      captureTrace(res.headers as any);
      setTickets(res.data);
      log(`Loaded ${res.data.length} tickets`);
    } catch (err: any) {
      log(`Failed to load tickets: ${err.message}`, 'error');
    }
  }, [token, user]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  async function handleLogout() {
    try {
      const res = await api.delete('/auth/logout', { headers: authHeader(token) });
      captureTrace(res.headers as any);
    } catch {}
    logout();
    router.push('/login');
    log('Logged out');
  }

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !description) return;
    try {
      const res = await api.post(
        '/tickets',
        { title, description, priority, userId: user!.userId },
        { headers: authHeader(token) },
      );
      captureTrace(res.headers as any);
      log(`Ticket created: ${res.data.id}`, 'success');
      setTitle('');
      setDescription('');
      setPriority('medium');
      loadTickets();
    } catch (err: any) {
      log(`Create failed: ${err.message}`, 'error');
    }
  }

  async function handleStatusUpdate(id: string, status: string) {
    try {
      const res = await api.patch(
        `/tickets/${id}/status`,
        { status, assignedTo: user!.userId },
        { headers: authHeader(token) },
      );
      captureTrace(res.headers as any);
      log(`Ticket ${id} → ${status}`, 'success');
      loadTickets();
    } catch (err: any) {
      log(`Update failed: ${err.message}`, 'error');
    }
  }

  if (!isLoggedIn || !user) return null;

  return (
    <div
      style={{
        fontFamily: "'SF Mono', Consolas, monospace",
        background: 'var(--bg)',
        color: 'var(--text)',
        minHeight: '100vh',
        fontSize: 13,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          <span style={{ color: 'var(--blue)' }}>moondrop</span> · Logger Demo — Customer Support
          Portal
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            {user.name} ({user.role})
          </span>
          <button
            onClick={handleLogout}
            style={{
              background: 'var(--red-bg)',
              border: '1px solid var(--red)',
              borderRadius: 6,
              color: 'var(--red)',
              padding: '5px 10px',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'inherit',
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap: 24,
          maxWidth: 1400,
          margin: '0 auto',
          padding: 24,
        }}
      >
        {/* Left column */}
        <div>
          {/* Create ticket */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              marginBottom: 16,
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '.5px',
              }}
            >
              New Ticket
            </div>
            <div style={{ padding: 16 }}>
              <form onSubmit={handleCreateTicket}>
                <div style={{ marginBottom: 12 }}>
                  <label
                    style={{
                      display: 'block',
                      color: 'var(--muted)',
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '.4px',
                      marginBottom: 5,
                    }}
                  >
                    Title
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="Briefly describe your issue"
                    style={{
                      width: '100%',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '8px 12px',
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      fontSize: 13,
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label
                    style={{
                      display: 'block',
                      color: 'var(--muted)',
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '.4px',
                      marginBottom: 5,
                    }}
                  >
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    placeholder="Provide more details…"
                    rows={3}
                    style={{
                      width: '100%',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '8px 12px',
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      fontSize: 13,
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label
                      style={{
                        display: 'block',
                        color: 'var(--muted)',
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '.4px',
                        marginBottom: 5,
                      }}
                    >
                      Priority
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: '8px 12px',
                        color: 'var(--text)',
                        fontFamily: 'inherit',
                        fontSize: 13,
                        outline: 'none',
                      }}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    style={{
                      background: '#1f6feb',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '8px 16px',
                      fontFamily: 'inherit',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Submit Ticket
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Tickets list */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '.5px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              Tickets
              <button
                onClick={loadTickets}
                style={{
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text)',
                  padding: '5px 10px',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'inherit',
                }}
              >
                ↻ Refresh
              </button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tickets.length === 0 ? (
                <p style={{ color: 'var(--faint)', textAlign: 'center', padding: '24px 0' }}>
                  No tickets found.
                </p>
              ) : (
                tickets.map((t) => (
                  <TicketCard
                    key={t.id}
                    ticket={t}
                    userRole={user.role}
                    userId={user.userId}
                    onStatusUpdate={handleStatusUpdate}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div>
          {/* Trace panel */}
          {traceId && (
            <div
              style={{
                background: 'var(--blue-bg)',
                border: '1px solid var(--blue)',
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '.5px',
                  color: 'var(--blue)',
                  marginBottom: 6,
                }}
              >
                Last x-loki-trace-id captured
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: '#79c0ff',
                  wordBreak: 'break-all',
                  display: 'block',
                  marginBottom: 10,
                }}
              >
                {traceId}
              </span>
              <a
                href={`${TRACE_VIEWER}?traceId=${traceId}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-block',
                  background: 'var(--blue)',
                  color: 'var(--bg)',
                  padding: '5px 12px',
                  borderRadius: 5,
                  textDecoration: 'none',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                Open Trace Viewer ↗
              </a>
            </div>
          )}

          {/* Activity log */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '.5px',
              }}
            >
              Activity Log
            </div>
            <div style={{ padding: 16, maxHeight: 400, overflowY: 'auto' }}>
              {entries.length === 0 ? (
                <p style={{ color: 'var(--faint)' }}>Waiting for activity…</p>
              ) : (
                entries.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      padding: '3px 0',
                      borderBottom: '1px solid var(--surface2)',
                      color: logColor(e.type),
                      fontSize: 11,
                      lineHeight: 1.7,
                    }}
                  >
                    {e.time}
                    {'  '}
                    {e.msg}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function logColor(type: string) {
  if (type === 'error') return 'var(--red)';
  if (type === 'success') return 'var(--green)';
  if (type === 'trace') return 'var(--purple)';
  return 'var(--muted)';
}

function TicketCard({
  ticket: t,
  userRole,
  userId,
  onStatusUpdate,
}: {
  ticket: Ticket;
  userRole: string;
  userId: string;
  onStatusUpdate: (id: string, status: string) => void;
}) {
  const [status, setStatus] = useState(t.status);

  const priorityColors: Record<string, { bg: string; border: string; text: string }> = {
    critical: { bg: 'var(--red-bg)', border: 'var(--red)', text: 'var(--red)' },
    high: { bg: 'var(--yellow-bg)', border: 'var(--yellow)', text: 'var(--yellow)' },
    medium: { bg: 'var(--blue-bg)', border: 'var(--blue)', text: 'var(--blue)' },
    low: { bg: 'var(--surface)', border: 'var(--faint)', text: 'var(--faint)' },
  };
  const pc = priorityColors[t.priority] ?? priorityColors.low;

  return (
    <div
      style={{
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--faint)' }}>{t.id}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 10,
            textTransform: 'uppercase',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
          }}
        >
          {t.status}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 10,
            textTransform: 'uppercase',
            background: pc.bg,
            border: `1px solid ${pc.border}`,
            color: pc.text,
          }}
        >
          {t.priority}
        </span>
      </div>
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#f0f6fc' }}>{t.title}</div>
      <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.6, marginBottom: 8 }}>
        {t.description}
      </div>
      {userRole !== 'customer' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Ticket['status'])}
            style={{
              flex: 1,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 8px',
              color: 'var(--text)',
              fontFamily: 'inherit',
              fontSize: 12,
              outline: 'none',
            }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={() => onStatusUpdate(t.id, status)}
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              color: 'var(--text)',
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'inherit',
            }}
          >
            Update
          </button>
        </div>
      )}
    </div>
  );
}
