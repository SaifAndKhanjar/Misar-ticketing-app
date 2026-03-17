import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Users, Clock, CheckCircle, Trash2, Scissors,
  Star, RefreshCw, QrCode, Phone, ExternalLink
} from 'lucide-react';
import { socket } from './socket';
import CustomerJoin from './CustomerJoin';
import { formatTime } from './utils/format';
import { MINS_PER_MISAR } from './constants';
import './App.css';

// ─── Header ────────────────────────────────────────────────────────────────────
function Header({ queueCount, onLogout }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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
          <div className="live-clock">{now.toLocaleTimeString('en-OM', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</div>
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

// ─── Admin View ────────────────────────────────────────────────────────────────
function getAuthHeaders() {
  const token = localStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('admin_token'));
  const [queueData, setQueueData] = useState({ customers: [], totalWait: 0 });
  const [serverInfo, setServerInfo] = useState({ joinUrl: 'http://localhost:3001/join' });
  const [actionError, setActionError] = useState('');
  const [loadingId, setLoadingId] = useState(null);

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
      .catch(() => setActionError('Failed to load queue'));

    fetch('/api/server-info', { headers })
      .then(async (r) => {
        if (r.status === 401) { handleUnauthorized(); return; }
        const data = await r.json();
        setServerInfo(data);
      })
      .catch(() => setActionError('Failed to load server info'));

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
    setLoadingId(id);
    setActionError('');
    try {
      const res = await fetch(`/api/queue/${id}/done`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.status === 401) handleUnauthorized();
      else if (!res.ok) setActionError('Failed to update queue');
    } catch {
      setActionError('Connection error');
    } finally {
      setLoadingId(null);
    }
  };

  const handleRemove = async (id) => {
    if (!window.confirm('Remove this customer from the queue?')) return;
    setLoadingId(id);
    setActionError('');
    try {
      const res = await fetch(`/api/queue/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.status === 401) handleUnauthorized();
      else if (!res.ok) setActionError('Failed to update queue');
    } catch {
      setActionError('Connection error');
    } finally {
      setLoadingId(null);
    }
  };

  const joinUrl = serverInfo.joinUrl || `http://${serverInfo.ip || 'localhost'}:${serverInfo.port || 3001}/join`;
  const { customers, totalWait } = queueData;

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
                <div className="qr-container">
                  <QRCodeSVG value={joinUrl} size={180} bgColor={"#ffffff"} fgColor={"#3a2010"} level={"H"} includeMargin={true} />
                </div>
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
                  <div key={customer.id} className={`queue-card ${i === 0 ? 'queue-card--active' : ''}`}>
                    <div className="queue-card-left">
                      <div className={`position-badge ${i === 0 ? 'position-badge--active' : ''}`}>
                        {i === 0 ? <Star size={14} /> : i + 1}
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
                        {i === 0 ? (
                          <span className="wait-now">Up Next!</span>
                        ) : (
                          <span className="wait-value">{formatTime(customer.waitBefore)}</span>
                        )}
                      </div>
                      <div className="card-actions">
                        <button
                          className="btn-done"
                          onClick={() => handleDone(customer.id)}
                          title="Mark as Done"
                          disabled={loadingId !== null}
                        >
                          <CheckCircle size={18} />
                        </button>
                        <button
                          className="btn-remove"
                          onClick={() => handleRemove(customer.id)}
                          title="Remove"
                          disabled={loadingId !== null}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
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
