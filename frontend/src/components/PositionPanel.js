import React from 'react';
import { Briefcase, XCircle } from 'lucide-react';

function PositionCard({ position }) {
  const pnl = position.unrealized_pnl || 0;
  const pnlPct = position.unrealized_pnl_pct || 0;
  const isPositive = pnl >= 0;

  const handleClose = async () => {
    try {
      await fetch(`/api/positions/${position.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('Failed to close position:', err);
    }
  };

  return (
    <div className="position-card">
      <div className="position-header">
        <span className="position-pair">{position.market || 'ETH/USD'}</span>
        <span className={`position-side ${position.side || 'long'}`}>
          {position.side || 'long'}
        </span>
      </div>

      <div className={`position-pnl ${isPositive ? 'positive' : 'negative'}`}>
        {isPositive ? '+' : ''}${pnl.toFixed(2)} ({isPositive ? '+' : ''}
        {pnlPct.toFixed(2)}%)
      </div>

      <div className="position-details">
        <div className="position-detail">
          <span className="label">Entry </span>
          <span className="value">
            ${Number(position.entry_price || 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="position-detail">
          <span className="label">Current </span>
          <span className="value">
            ${Number(position.current_price || 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="position-detail">
          <span className="label">Size </span>
          <span className="value">${(position.size || 0).toFixed(2)}</span>
        </div>
        <div className="position-detail">
          <span className="label">Duration </span>
          <span className="value">{position.duration || '0m'}</span>
        </div>
        <div className="position-detail">
          <span className="label">Stop </span>
          <span className="value" style={{ color: '#f85149' }}>
            ${Number(position.stop_loss || 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="position-detail">
          <span className="label">Target </span>
          <span className="value" style={{ color: '#3fb950' }}>
            ${Number(position.take_profit || 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      <button className="btn btn-danger" style={{ width: '100%' }} onClick={handleClose}>
        <XCircle size={14} />
        Close Position
      </button>
    </div>
  );
}

export default function PositionPanel({ positions }) {
  const activePositions = positions || [];

  return (
    <div>
      <div className="panel-header">
        <h3>
          <Briefcase size={14} />
          Active Positions ({activePositions.length})
        </h3>
      </div>
      <div className="panel-body">
        {activePositions.length === 0 ? (
          <div className="empty-state">
            <Briefcase size={24} style={{ color: '#484f58' }} />
            <p>No active positions</p>
          </div>
        ) : (
          activePositions.map((pos, i) => (
            <PositionCard key={pos.id || i} position={pos} />
          ))
        )}
      </div>
    </div>
  );
}
