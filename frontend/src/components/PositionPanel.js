import React, { useState } from 'react';
import { Briefcase, XCircle, AlertTriangle } from 'lucide-react';
import { API_BASE } from '../hooks/useWebSocket';

function PositionCard({ position, onNotify }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  const pnl = position.unrealized_pnl || 0;
  const isPositive = pnl >= 0;
  const entryPrice = position.entry_price || 0;
  const size = position.size || 0;
  const pnlPct = entryPrice > 0 ? (pnl / size * 100) : 0;

  const market = position.market || {};
  const currentPrice = position.side === 'YES' ? (market.yes_price || 0) : (market.no_price || 0);
  const timeLeftMin = market.end_time
    ? Math.max(0, (market.end_time - Date.now() / 1000) / 60)
    : 0;
  const heldMin = position.entry_time
    ? (Date.now() / 1000 - position.entry_time) / 60
    : 0;

  const handleClose = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/positions/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_id: position.id }),
      });
      const data = await res.json();
      if (data.closed) {
        onNotify?.('Position closed', 'success');
      } else {
        onNotify?.('Failed to close position', 'error');
      }
    } catch (err) {
      onNotify?.(`Close failed: ${err.message}`, 'error');
    }
    setLoading(false);
    setConfirming(false);
  };

  return (
    <div className="position-card">
      <div className="position-header">
        <span className="position-pair">{market.asset || 'ETH'} - {market.question?.slice(0, 25) || 'Market'}</span>
        <span className={`position-side ${position.side === 'YES' ? 'long' : 'short'}`}>
          {position.side || 'YES'}
        </span>
      </div>

      <div className={`position-pnl ${isPositive ? 'positive' : 'negative'}`}>
        {isPositive ? '+' : ''}${pnl.toFixed(2)} ({isPositive ? '+' : ''}{pnlPct.toFixed(1)}%)
      </div>

      <div className="position-details">
        <div className="position-detail">
          <span className="label">Entry</span>
          <span className="value">{(entryPrice * 100).toFixed(1)}c</span>
        </div>
        <div className="position-detail">
          <span className="label">Current</span>
          <span className="value">{(currentPrice * 100).toFixed(1)}c</span>
        </div>
        <div className="position-detail">
          <span className="label">Size</span>
          <span className="value">${size.toFixed(2)}</span>
        </div>
        <div className="position-detail">
          <span className="label">Held</span>
          <span className="value">{heldMin.toFixed(1)}m</span>
        </div>
        <div className="position-detail">
          <span className="label">Mkt Time</span>
          <span className="value" style={{ color: timeLeftMin < 2 ? '#f85149' : '#8b949e' }}>
            {timeLeftMin.toFixed(1)}m left
          </span>
        </div>
        <div className="position-detail">
          <span className="label">Rule</span>
          <span className="value">{position.rule_name || '-'}</span>
        </div>
      </div>

      <button
        className={`btn ${confirming ? 'btn-danger' : 'btn-secondary'}`}
        style={{ width: '100%' }}
        onClick={handleClose}
        disabled={loading}
        onBlur={() => setConfirming(false)}
      >
        <XCircle size={14} />
        {loading ? 'Closing...' : confirming ? 'Confirm Close?' : 'Close Position'}
      </button>
    </div>
  );
}

export default function PositionPanel({ positions, onNotify }) {
  const activePositions = (positions || []).filter(p => p.status === 'open');

  return (
    <div>
      <div className="panel-header">
        <h3><Briefcase size={14} /> Positions ({activePositions.length})</h3>
      </div>
      <div className="panel-body">
        {activePositions.length === 0 ? (
          <div className="empty-state">
            <Briefcase size={24} style={{ color: '#484f58' }} />
            <p>No active positions</p>
          </div>
        ) : (
          activePositions.map((pos, i) => (
            <PositionCard key={pos.id || i} position={pos} onNotify={onNotify} />
          ))
        )}
      </div>
    </div>
  );
}
