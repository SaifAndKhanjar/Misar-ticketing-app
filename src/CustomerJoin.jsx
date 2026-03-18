import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import { formatTime, formatClock } from './utils/format';
import { MINS_PER_MISAR } from './constants';
import './CustomerJoin.css';

// ── Ticket Confirmation Screen ─────────────────────────────────────────────
function TicketView({ ticket, isDone, onBack }) {
  const waitMins = ticket.waitBefore;

  return (
    <div className="ticket-view">
      <div className="ticket-card">
        <div className="ticket-top">
          <img src="/logo.png" alt="سيف و خنجر" className="ticket-logo" />
          <h1 className="brand-ar">سيف و خنجر</h1>
          <p className="brand-tagline">Oud is a wind that indicates good morals</p>
        </div>

        <div className="ticket-divider">
          <div className="ticket-hole left" />
          <div className="ticket-dashes" />
          <div className="ticket-hole right" />
        </div>

        <div className="ticket-body">
          {isDone ? (
             <div className="ticket-success-state">
                <div className="ticket-position-wrap">
                  <span className="ticket-position-label">Status</span>
                  <span className="ticket-position-num" style={{ fontSize: '2rem' }}>DONE!</span>
                </div>
                <div className="ticket-alert ticket-alert--now" style={{ marginTop: '2rem' }}>
                  🎉 Your Misars are ready! Thank you for visiting Saif & Khanjar.
                </div>
             </div>
          ) : (
            <>
              <div className="ticket-position-wrap">
                <span className="ticket-position-label">Queue Position</span>
                <span className="ticket-position-num">#{ticket.position}</span>
              </div>

              <div className="ticket-meta-grid">
                <div className="ticket-meta-item">
                  <span className="tm-label">Name</span>
                  <span className="tm-value">{ticket.name}</span>
                </div>
                <div className="ticket-meta-item">
                  <span className="tm-label">Misars</span>
                  <span className="tm-value">{ticket.misars}</span>
                </div>
                <div className="ticket-meta-item">
                  <span className="tm-label">Your Wait</span>
                  <span className="tm-value" style={{ borderBottom: '2px solid var(--clr-gold)', display: 'inline-block' }}>
                    {waitMins > 0 ? formatTime(waitMins) : 'Up Next!'}
                  </span>
                </div>
                <div className="ticket-meta-item">
                  <span className="tm-label">Prep Time</span>
                  <span className="tm-value">{ticket.misars * MINS_PER_MISAR} min</span>
                </div>
              </div>

              <div className="ticket-ready-block">
                <span className="ticket-ready-label">⏰ Ready at approximately</span>
                <span className="ticket-ready-time">{formatClock(new Date(ticket.joinedAt + (ticket.waitBefore + ticket.misars * MINS_PER_MISAR) * 60000))}</span>
              </div>

              {waitMins === 0 ? (
                <div className="ticket-alert ticket-alert--now">
                  🎉 You're next! Please approach the counter.
                </div>
              ) : (
                <div className="ticket-alert ticket-alert--wait">
                  Please stay nearby. Your turn is coming!
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <button className="btn-outline-back" onClick={onBack}>
        ← Back to Join Page
      </button>
    </div>
  );
}

// ── Join Form ─────────────────────────────────────────────────────────────
export default function CustomerJoin() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [misars, setMisars] = useState(1);
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const [queueData, setQueueData] = useState({ customers: [], totalWait: 0, queueOpen: true });
  const [showQueueNames, setShowQueueNames] = useState(false);
  const normalizePhone = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('968') && digits.length > 8) return digits.slice(-8);
    return digits.slice(0, 8);
  };

  useEffect(() => {
    fetch('/api/queue').then(r => r.json()).then(setQueueData);
    socket.on('queue:update', setQueueData);
    return () => socket.off('queue:update');
  }, []);

  const totalWaitBefore = queueData.totalWait;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const normalizedPhone = normalizePhone(phone);
    if (!name.trim() || !normalizedPhone) {
      setError('Please fill in your name and phone number.');
      return;
    }
    if (normalizedPhone.length !== 8) {
      setError('Phone number must be exactly 8 digits (do not include +968).');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: normalizedPhone, misars }),
      });
      const raw = await res.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }

      if (!res.ok) {
        const msg =
          (data && typeof data.error === 'string' && data.error) ||
          `Could not join the queue (HTTP ${res.status}). Please try again.`;
        setError(msg);
        return;
      }

      setTicket(data);
    } catch {
      setError('Could not join the queue. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (ticket) {
    // Find our latest ticket info from the live queue
    const liveTicket = queueData.customers.find(c => c.id === ticket.id);
    
    // If we're still in line, show the live data. 
    // If not, we keep showing the last known ticket (or could show a 'Finished' screen)
    return (
      <TicketView 
        ticket={liveTicket || ticket} 
        isDone={!liveTicket}
        onBack={() => { setTicket(null); setName(''); setPhone(''); setMisars(1); }} 
      />
    );
  }

  const { customers, queueOpen = true } = queueData;

  return (
    <div className="join-page">
      <div className="join-container">
        {/* Header */}
        <div className="join-header">
          <img src="/logo.png" alt="سيف و خنجر" className="join-logo" />
          <h1 className="join-brand-ar">سيف و خنجر</h1>
          <p className="join-brand-tagline">Oud is a wind that indicates good morals</p>
          <div className="join-divider" />
        </div>

        {/* Current Queue info box */}
        <button
          type="button"
          className={`join-queue-box ${showQueueNames ? 'join-queue-box--open' : ''}`}
          onClick={() => setShowQueueNames(v => !v)}
          aria-expanded={showQueueNames}
          aria-controls="join-queue-names"
        >
          <div className="join-queue-left">
            <span className="join-queue-label">Current Queue</span>
            <span className="join-queue-value">{customers.length} {customers.length === 1 ? 'Person' : 'People'} Waiting</span>
            <span className="join-queue-toggle-hint">
              {customers.length === 0 ? 'Tap to refresh' : (showQueueNames ? 'Tap to hide names' : 'Tap to view names')}
            </span>
          </div>
          <div className="join-queue-right">
            <div className={`join-queue-pill ${totalWaitBefore === 0 ? 'join-queue-pill--no-wait' : ''}`}>
              <div className="join-queue-dot" />
              <span>{totalWaitBefore === 0 ? 'No Wait' : `~${formatTime(totalWaitBefore)} wait`}</span>
            </div>
            <div className={`join-queue-chevron ${showQueueNames ? 'join-queue-chevron--open' : ''}`} aria-hidden="true">
              ▾
            </div>
          </div>
        </button>

        <div
          id="join-queue-names"
          className={`join-queue-names ${showQueueNames ? 'join-queue-names--open' : ''}`}
        >
          {customers.length === 0 ? (
            <div className="join-queue-names-empty">No one is waiting right now.</div>
          ) : (
            <ol className="join-queue-names-list">
              {customers.map((c, idx) => (
                <li key={c.id} className={`join-queue-name ${idx === 0 ? 'join-queue-name--next' : ''}`}>
                  <span className="join-queue-pos">{idx + 1}</span>
                  <span className="join-queue-person">{c.name}</span>
                  {idx === 0 && <span className="join-queue-next">Up next</span>}
                </li>
              ))}
            </ol>
          )}
        </div>

        {!queueOpen ? (
          <div className="join-form-card join-closed-card">
            <h2 className="join-title">Queue is closed</h2>
            <p className="join-subtitle">The queue is not accepting new joins right now. People already in line will still be served. Please try again later.</p>
          </div>
        ) : (
        /* Form card */
        <div className="join-form-card">
          <div className="join-intro">
            <h2 className="join-title">Join the Misar Queue</h2>
            <p className="join-subtitle">Enter your details below and we'll hold your place in line.</p>
          </div>

          <form className="join-form" onSubmit={handleSubmit}>
            {error && <div className="join-error">{error}</div>}

            <div className="jfield">
              <label htmlFor="j-name" className="jfield-label">Full Name</label>
              <input
                id="j-name"
                type="text"
                className="jfield-input"
                placeholder="e.g. Mohammed Al-Rashdi"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>

            <div className="jfield">
              <label htmlFor="j-phone" className="jfield-label">Phone Number</label>
              <input
                id="j-phone"
                type="tel"
                className="jfield-input"
                placeholder="8 digits (e.g. 9XXXXXXX)"
                value={phone}
                onChange={e => setPhone(normalizePhone(e.target.value))}
                required
                autoComplete="tel"
                inputMode="numeric"
                maxLength={8}
                pattern="\\d{8}"
              />
            </div>

            <div className="jfield">
              <label className="jfield-label">
                Number of Misars
                <span className="jfield-hint">{misars * MINS_PER_MISAR} min</span>
              </label>

              <div className="jstepper">
                <button
                  type="button"
                  className="jstepper-btn"
                  onClick={() => setMisars(m => Math.max(1, m - 1))}
                  disabled={misars <= 1}
                >−</button>
                <div className="jstepper-value">
                  <span className="jstepper-num">{misars}</span>
                  <span className="jstepper-label">{misars === 1 ? 'misar' : 'misars'}</span>
                </div>
                <button
                  type="button"
                  className="jstepper-btn"
                  onClick={() => setMisars(m => Math.min(10, m + 1))}
                  disabled={misars >= 10}
                >+</button>
              </div>

              <div className="misar-vis">
                <div className="misar-vis-dot misar-vis-dot--single" />
              </div>
            </div>

            <button type="submit" className="join-submit-btn" disabled={loading}>
              {loading ? (
                <span className="spinner" />
              ) : (
                <>Join Queue</>
              )}
            </button>

            <div className="join-disclaimer" aria-hidden="true">
              By joining, you agree we may use your phone number to share updates and offers in the future.
            </div>
          </form>
        </div>
        )}
      </div>
    </div>
  );
}
