import axios from 'axios';
import { attachSessionInterceptor } from '@moondrop/logger-client';

// Injected by Vite at build time — override via VITE_API_URL env var.
// In Docker the build sets this to http://localhost:3003/api so the
// browser (running on the host) can reach the backend container.
const API_BASE       = import.meta.env.VITE_API_URL       ?? 'http://localhost:3003/api';
const TRACE_VIEWER   = import.meta.env.VITE_TRACE_VIEWER  ?? 'http://localhost:3003/_trace';

const api = axios.create({ baseURL: API_BASE });

const interceptorIds = attachSessionInterceptor(api, {
  responseHeader: 'x-loki-trace-id',
  requestHeader:  'x-loki-trace-id',
  storageKey:     'lokiTraceId',
});

console.log('[logger-client] interceptors attached', interceptorIds);

// ── State ────────────────────────────────────────────────────────────────────
let authToken   = localStorage.getItem('authToken') ?? null;
let currentUser = JSON.parse(localStorage.getItem('currentUser') ?? 'null');
let lastTraceId = null;

function authHeader() {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const loginSection   = document.getElementById('login-section');
const appSection     = document.getElementById('app-section');
const loginForm      = document.getElementById('login-form');
const logoutBtn      = document.getElementById('logout-btn');
const userDisplay    = document.getElementById('user-display');
const ticketsList    = document.getElementById('tickets-list');
const ticketForm     = document.getElementById('ticket-form');
const tracePanel     = document.getElementById('trace-panel');
const traceIdEl      = document.getElementById('last-trace-id');
const traceViewerBtn = document.getElementById('open-trace-btn');
const statusLog      = document.getElementById('status-log');

// ── Helpers ──────────────────────────────────────────────────────────────────
function log(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `log-line log-${type}`;
  el.textContent = `${new Date().toLocaleTimeString()}  ${msg}`;
  statusLog.prepend(el);
}

function captureTrace(response) {
  const tid = response.headers?.['x-loki-trace-id'];
  if (tid) {
    lastTraceId = tid;
    traceIdEl.textContent = tid;
    tracePanel.classList.remove('hidden');
    traceViewerBtn.href = `${TRACE_VIEWER}?traceId=${tid}`;
    log(`trace-id: ${tid}`, 'trace');
  }
  return response;
}

function showApp() {
  loginSection.classList.add('hidden');
  appSection.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
  userDisplay.textContent = `${currentUser.name}  (${currentUser.role})`;
}

function showLogin() {
  loginSection.classList.remove('hidden');
  appSection.classList.add('hidden');
  logoutBtn.classList.add('hidden');
}

// ── Auth ─────────────────────────────────────────────────────────────────────
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  try {
    const res = await api.post('/auth/login', { email, password });
    captureTrace(res);
    authToken   = res.data.token;
    currentUser = { userId: res.data.userId, email: res.data.email, name: res.data.name, role: res.data.role };
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    log(`Logged in as ${currentUser.email}`, 'success');
    showApp();
    loadTickets();
  } catch (err) {
    log(`Login failed: ${err.response?.data?.message ?? err.message}`, 'error');
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    const res = await api.delete('/auth/logout', { headers: authHeader() });
    captureTrace(res);
  } catch { /* best-effort */ }
  authToken   = null;
  currentUser = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  log('Logged out');
  showLogin();
});

// ── Tickets ──────────────────────────────────────────────────────────────────
window.loadTickets = async function loadTickets() {
  try {
    const res = await api.get('/tickets', {
      headers: authHeader(),
      params: currentUser?.role === 'customer' ? { userId: currentUser.userId } : {},
    });
    captureTrace(res);
    renderTickets(res.data);
    log(`Loaded ${res.data.length} tickets`);
  } catch (err) {
    log(`Failed to load tickets: ${err.message}`, 'error');
  }
};

function renderTickets(tickets) {
  ticketsList.innerHTML = '';
  if (!tickets.length) {
    ticketsList.innerHTML = '<p class="empty">No tickets found.</p>';
    return;
  }
  tickets.forEach(t => {
    const el = document.createElement('div');
    el.className = `ticket ticket-${t.status} ticket-priority-${t.priority}`;
    el.innerHTML = `
      <div class="ticket-header">
        <span class="ticket-id">${t.id}</span>
        <span class="badge badge-status">${t.status}</span>
        <span class="badge badge-priority">${t.priority}</span>
      </div>
      <div class="ticket-title">${t.title}</div>
      <div class="ticket-desc">${t.description}</div>
      <div class="ticket-footer">
        ${t.assignedTo ? `<span>Assigned: ${t.assignedTo}</span>` : ''}
        ${currentUser?.role !== 'customer' ? `
          <select class="status-select" data-id="${t.id}">
            <option value="open"        ${t.status==='open'        ?'selected':''}>Open</option>
            <option value="in_progress" ${t.status==='in_progress' ?'selected':''}>In Progress</option>
            <option value="resolved"    ${t.status==='resolved'    ?'selected':''}>Resolved</option>
            <option value="closed"      ${t.status==='closed'      ?'selected':''}>Closed</option>
          </select>
          <button class="btn-update" data-id="${t.id}">Update</button>
        ` : ''}
      </div>
    `;
    ticketsList.appendChild(el);
  });

  document.querySelectorAll('.btn-update').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id     = btn.dataset.id;
      const select = document.querySelector(`.status-select[data-id="${id}"]`);
      const status = select.value;
      try {
        const res = await api.patch(`/tickets/${id}/status`,
          { status, assignedTo: currentUser.userId },
          { headers: authHeader() },
        );
        captureTrace(res);
        log(`Ticket ${id} → ${status}`, 'success');
        window.loadTickets();
      } catch (err) {
        log(`Update failed: ${err.message}`, 'error');
      }
    });
  });
}

ticketForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title       = document.getElementById('ticket-title').value.trim();
  const description = document.getElementById('ticket-desc').value.trim();
  const priority    = document.getElementById('ticket-priority').value;
  if (!title || !description) return;
  try {
    const res = await api.post('/tickets',
      { title, description, priority, userId: currentUser.userId },
      { headers: authHeader() },
    );
    captureTrace(res);
    log(`Ticket created: ${res.data.id}`, 'success');
    ticketForm.reset();
    window.loadTickets();
  } catch (err) {
    log(`Create failed: ${err.message}`, 'error');
  }
});

// ── Boot ─────────────────────────────────────────────────────────────────────
if (authToken && currentUser) {
  showApp();
  window.loadTickets();
} else {
  showLogin();
}
