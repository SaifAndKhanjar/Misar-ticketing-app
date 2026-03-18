import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Users, CheckCircle, Trash2, Scissors,
  Star, QrCode, Phone, ExternalLink
} from 'lucide-react';
import { socket, useSocketStatus } from './socket';
import CustomerJoin from './CustomerJoin';
import { formatTime } from './utils/format';
import { MINS_PER_MISAR } from './constants';
import './App.css';

// ─── LiveClock (isolates 1s tick so Header doesn't re-render every second) ─────
function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="live-clock">
      {now.toLocaleTimeString('en-OM', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
    </div>
  );
}

// ─── Header ────────────────────────────────────────────────────────────────────
function Header({ queueCount, onLogout }) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand">
          <img src="/logo.png" alt="Logo" className="header-logo" />
          <div>
            <h1 className="brand-title">سيف و خنجر</h1>
            <p className="brand-subtitle">Saif & Khanjar Misar Queue</p>
          </div>
        </div>
        <div className="header-meta">
          <LiveClock />
          {queueCount > 0 && (
            <div className="queue-badge">
              <Users size={14} />
              <span>{queueCount} waiting</span>
            </div>
          )}
          {onLogout && (
            <button type="button" className="header-logout" onClick={onLogout} title="Log out">
              Log out
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Login View ────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('admin_token', data.token);
        onLogin();
      } else {
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <img src="/logo.png" alt="Saif & Khanjar" className="login-logo" />
          <h1 className="login-title">سيف و خنجر</h1>
          <p className="login-subtitle">Admin Dashboard Access</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}
          <input
            type="password"
            className="login-input"
            placeholder="Enter Password..."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Authenticating...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Queue card (memoized to avoid re-renders when only wait times change) ─────
const QueueCard = memo(function QueueCard({ customer, index, onDone, onRemove, loadingId }) {
  return (
    <div className={`queue-card ${index === 0 ? 'queue-card--active' : ''}`}>
      <div className="queue-card-left">
        <div className={`position-badge ${index === 0 ? 'position-badge--active' : ''}`}>
          {index === 0 ? <Star size={14} /> : index + 1}
        </div>
        <div className="customer-info">
          <strong className="customer-name">{customer.name}</strong>
          <div className="customer-meta">
            <span className="meta-pill"><Scissors size={11} /> {customer.misars} misars</span>
            <span className="meta-pill"><Phone size={11} /> {customer.phone}</span>
          </div>
        </div>
      </div>
      <div className="queue-card-right">
        <div className="wait-info">
          {index === 0 ? (
            <span className="wait-now">Up Next!</span>
          ) : (
            <span className="wait-value">{formatTime(customer.waitBefore)}</span>
          )}
        </div>
        <div className="card-actions">
          <button
            className="btn-done"
            onClick={() => onDone(customer.id)}
            title="Mark as Done"
            disabled={loadingId !== null}
          >
            <CheckCircle size={18} />
          </button>
          <button
            className="btn-remove"
            onClick={() => onRemove(customer.id)}
            title="Remove"
            disabled={loadingId !== null}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
});

// ─── Admin View ────────────────────────────────────────────────────────────────
function getAuthHeaders() {
  const token = localStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('admin_token'));
  const [queueData, setQueueData] = useState({ customers: [], totalWait: 0, queueOpen: true });
  const [serverInfo, setServerInfo] = useState({ joinUrl: 'http://localhost:3001/join' });
  const [actionError, setActionError] = useState('');
  const actionErrorTimeoutRef = useRef(null);
  const [loadingId, setLoadingId] = useState(null);
  const [toggleLoading, setToggleLoading] = useState(false);
  const socketStatus = useSocketStatus();
  const qrWrapRef = useRef(null);

  const setActionErrorWithAutoClear = useCallback((message) => {
    if (actionErrorTimeoutRef.current) clearTimeout(actionErrorTimeoutRef.current);
    setActionError(message);
    if (message) {
      actionErrorTimeoutRef.current = setTimeout(() => setActionError(''), 5000);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (actionErrorTimeoutRef.current) clearTimeout(actionErrorTimeoutRef.current);
    };
  }, []);

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem('admin_auth');
    localStorage.removeItem('admin_token');
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };

    fetch('/api/queue', { headers })
      .then(async (r) => {
        if (r.status === 401) { handleUnauthorized(); return; }
        const data = await r.json();
        setQueueData(data);
      })
      .catch(() => setActionErrorWithAutoClear('Failed to load queue'));

    fetch('/api/server-info', { headers })
      .then(async (r) => {
        if (r.status === 401) { handleUnauthorized(); return; }
        const data = await r.json();
        setServerInfo(data);
      })
      .catch(() => setActionErrorWithAutoClear('Failed to load server info'));

    socket.on('queue:update', (data) => setQueueData(data));

    return () => socket.off('queue:update');
  }, [isAuthenticated, handleUnauthorized]);

  const handleLogin = () => {
    setIsAuthenticated(true);
    localStorage.setItem('admin_auth', 'true');
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_auth');
    localStorage.removeItem('admin_token');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const handleDone = async (id) => {
    setActionError('');
    const prev = queueData;
    const removed = prev.customers.find(c => c.id === id);
    setQueueData(prevState => ({
      ...prevState,
      customers: prevState.customers.filter(c => c.id !== id),
      totalWait: Math.max(0, (prevState.totalWait || 0) - ((removed?.misars ?? 0) * MINS_PER_MISAR))
    }));
    setLoadingId(id);
    try {
      const res = await fetch(`/api/queue/${id}/done`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.status === 401) {
        setQueueData(prev);
        handleUnauthorized();
      } else if (!res.ok) {
        setQueueData(prev);
        setActionErrorWithAutoClear('Failed to update queue');
      }
    } catch {
      setQueueData(prev);
      setActionErrorWithAutoClear('Connection error');
    } finally {
      setLoadingId(null);
    }
  };

  const handleRemove = async (id) => {
    if (!window.confirm('Remove this customer from the queue?')) return;
    setActionError('');
    const prev = queueData;
    setQueueData(prevState => ({
      ...prevState,
      customers: prevState.customers.filter(c => c.id !== id)
    }));
    setLoadingId(id);
    try {
      const res = await fetch(`/api/queue/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.status === 401) {
        setQueueData(prev);
        handleUnauthorized();
      } else if (!res.ok) {
        setQueueData(prev);
        setActionErrorWithAutoClear('Failed to update queue');
      }
    } catch {
      setQueueData(prev);
      setActionErrorWithAutoClear('Connection error');
    } finally {
      setLoadingId(null);
    }
  };

  const handleToggleQueue = async () => {
    setActionError('');
    setToggleLoading(true);
    try {
      const res = await fetch('/api/queue/toggle', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (res.status === 401) handleUnauthorized();
      else if (res.ok) {
        const data = await res.json();
        setQueueData(prev => ({ ...prev, queueOpen: data.queueOpen }));
      } else setActionErrorWithAutoClear('Failed to update queue status');
    } catch {
      setActionErrorWithAutoClear('Connection error');
    } finally {
      setToggleLoading(false);
    }
  };

  const joinUrl = serverInfo.joinUrl || `http://${serverInfo.ip || 'localhost'}:${serverInfo.port || 3001}/join`;

  const downloadA4QrPng = useCallback(async () => {
    const qrSvg = qrWrapRef.current?.querySelector('svg');
    if (!qrSvg) return;

    // A4 @ 300 DPI
    const W = 2480;
    const H = 3508;
    const qrSize = 1400;
    const qrX = Math.round((W - qrSize) / 2);
    const qrY = 700;

    const qrSerialized = new XMLSerializer().serializeToString(qrSvg);
    const qrBlob = new Blob([qrSerialized], { type: 'image/svg+xml;charset=utf-8' });
    const qrUrl = URL.createObjectURL(qrBlob);

    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = qrUrl;
      await img.decode();

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      // Title
      ctx.fillStyle = '#3a2010';
      ctx.textAlign = 'center';
      ctx.font = '700 90px Inter, Arial, sans-serif';
      ctx.fillText('Saif & Khanjar', W / 2, 240);
      ctx.font = '800 110px Tajawal, Arial, sans-serif';
      ctx.fillText('سيف و خنجر', W / 2, 370);

      // Subtitle + URL
      ctx.font = '600 48px Inter, Arial, sans-serif';
      ctx.fillStyle = '#7a4a18';
      ctx.fillText('Scan to join the queue', W / 2, 470);
      ctx.font = '600 38px Inter, Arial, sans-serif';
      ctx.fillStyle = '#3a2010';
      ctx.fillText(joinUrl, W / 2, 540);

      // QR
      ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

      // Footer hint
      ctx.font = '500 34px Inter, Arial, sans-serif';
      ctx.fillStyle = '#7a5a38';
      ctx.fillText('Keep this poster near the counter for customers.', W / 2, H - 220);

      const outUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = outUrl;
      a.download = 'misar-queue-qr-a4.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(qrUrl);
    }
  }, [joinUrl]);

  const { customers, totalWait, queueOpen = true } = queueData;

  return (
    <div className="app">
      <Header queueCount={customers.length} onLogout={handleLogout} />

      <main className="main">
        <div className="layout">
          {/* Left column: QR & Info */}
          <aside className="sidebar">
            <div className="qr-card">
              <div className="qr-card-header">
                <QrCode size={18} className="qr-card-icon" />
                <h2 className="qr-card-title">Customer QR Code</h2>
              </div>
              <div className="qr-body">
                <p className="qr-hint">Customers can scan this to join the queue from their phones.</p>
                <div className="qr-container" ref={qrWrapRef}>
                  <QRCodeSVG value={joinUrl} size={180} bgColor={"#ffffff"} fgColor={"#3a2010"} level={"H"} includeMargin={true} />
                </div>
                <button type="button" className="qr-download-btn" onClick={downloadA4QrPng}>
                  Download A4 QR (PNG)
                </button>
                <div className="qr-url-box">
                  <span className="qr-url-label">Join URL:</span>
                  <code className="qr-url-text">{joinUrl}</code>
                  <a href="/join" target="_blank" className="qr-link">
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            </div>

            <div className="info-card">
              <div className="info-card-title">
                <Scissors size={14} />
                System Info
              </div>
              <ul className="info-list">
                <li>Rate: <strong>{MINS_PER_MISAR} mins</strong> per misar</li>
                <li>Real-time sync: <strong>Active</strong></li>
                <li>Logo: <strong>سيف و خنجر</strong></li>
              </ul>
            </div>

            <div className="queue-status-card">
              <div className="queue-status-header">
                <span className="queue-status-label">Queue</span>
                <span className={`queue-status-badge ${queueOpen ? 'queue-status-badge--open' : 'queue-status-badge--closed'}`}>
                  {queueOpen ? 'Open' : 'Closed'}
                </span>
              </div>
              <p className="queue-status-hint">
                {queueOpen ? 'New customers can join. Stop to pause new joins.' : 'No new joins. People already in line stay.'}
              </p>
              <button
                type="button"
                className={`queue-status-btn ${queueOpen ? 'queue-status-btn--stop' : 'queue-status-btn--start'}`}
                onClick={handleToggleQueue}
                disabled={toggleLoading}
              >
                {toggleLoading ? 'Updating…' : queueOpen ? 'Stop queue' : 'Start queue'}
              </button>
            </div>
          </aside>

          {/* Right column: Queue */}
          <section className="queue-section">
            <div className="stats-bar">
              <div className="stat">
                <span className="stat-value">{customers.length}</span>
                <span className="stat-label">In Queue</span>
              </div>
              <div className="stat-divider" />
              <div className="stat">
                <span className="stat-value">{customers.reduce((s, c) => s + c.misars, 0)}</span>
                <span className="stat-label">Total Misars</span>
              </div>
              <div className="stat-divider" />
              <div className="stat">
                <span className="stat-value">{formatTime(totalWait)}</span>
                <span className="stat-label">Total Wait</span>
              </div>
            </div>

            <div className="queue-header">
              <h2 className="section-title">
                <Users size={18} />
                Live Shop Queue
              </h2>
            </div>

            {socketStatus !== 'connected' && (
              <div className="socket-status-banner" role="status">
                {socketStatus === 'connecting' ? 'Reconnecting…' : 'Connection lost'}
              </div>
            )}

            {actionError && (
              <div className="login-error" style={{ marginBottom: '1rem' }}>
                {actionError}
              </div>
            )}

            <div className="queue-list">
              {customers.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon"><Users size={32} /></div>
                  <h3 className="empty-title">Queue is Empty</h3>
                  <p className="empty-text">Invite customers to scan the QR code to join.</p>
                </div>
              ) : (
                customers.map((customer, i) => (
                  <QueueCard
                    key={customer.id}
                    customer={customer}
                    index={i}
                    onDone={handleDone}
                    onRemove={handleRemove}
                    loadingId={loadingId}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AdminDashboard />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/join" element={<CustomerJoin />} />
    </Routes>
  );
}
