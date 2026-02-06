import React, { useState } from 'react';
import { Zap, Check, X, HelpCircle } from 'lucide-react';

function SignalCard({ signal, onExecute, onDismiss }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const confidenceColor =
    signal.confidence >= 0.8
      ? '#3fb950'
      : signal.confidence >= 0.6
      ? '#d29922'
      : '#f85149';

  return (
    <div className="signal-card">
      <div className="signal-card-header">
        <span className={`signal-direction ${signal.direction}`}>
          {signal.direction === 'long' ? (
            <>
              <Zap size={12} /> Long
            </>
          ) : (
            <>
              <Zap size={12} /> Short
            </>
          )}
        </span>
        <span className="signal-confidence" style={{ color: confidenceColor }}>
          {(signal.confidence * 100).toFixed(0)}% confidence
        </span>
      </div>

      <div className="signal-details">
        <div className="signal-detail">
          <span className="label">Market</span>
          <span className="value">{signal.market || 'ETH/USD'}</span>
        </div>
        <div className="signal-detail">
          <span className="label">Edge</span>
          <span className="value" style={{ color: '#3fb950' }}>
            {((signal.edge || 0) * 100).toFixed(2)}%
          </span>
        </div>
        <div className="signal-detail">
          <span className="label">Strategy</span>
          <span className="value">{signal.strategy || 'mean_rev'}</span>
        </div>
        <div className="signal-detail">
          <span className="label">Size</span>
          <span className="value">${(signal.size || 0).toFixed(2)}</span>
        </div>
        <div className="signal-detail">
          <span className="label">Entry</span>
          <span className="value">
            ${Number(signal.entry_price || 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="signal-detail">
          <span className="label">Target</span>
          <span className="value" style={{ color: '#3fb950' }}>
            ${Number(signal.target_price || 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      <div className="signal-actions">
        <button
          className="btn btn-primary"
          onClick={() => onExecute(signal.id)}
        >
          <Check size={14} />
          Execute
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => onDismiss(signal.id)}
        >
          <X size={14} />
          Dismiss
        </button>
        <div
          className="signal-reason"
          style={{ marginLeft: 'auto', position: 'relative' }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <HelpCircle size={16} style={{ color: '#8b949e' }} />
          {showTooltip && (
            <div className="tooltip">
              <strong style={{ display: 'block', marginBottom: 4 }}>
                Why this trade?
              </strong>
              {signal.reason ||
                `Detected ${signal.direction} opportunity with ${(
                  signal.confidence * 100
                ).toFixed(0)}% confidence. Edge of ${(
                  (signal.edge || 0) * 100
                ).toFixed(2)}% based on ${
                  signal.strategy || 'mean reversion'
                } analysis. Price divergence between exchanges and Polymarket odds suggest favorable entry.`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SignalPanel({ signals }) {
  const activeSignals = signals || [];

  const handleExecute = async (signalId) => {
    try {
      await fetch(`/api/signals/${signalId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('Failed to execute signal:', err);
    }
  };

  const handleDismiss = async (signalId) => {
    try {
      await fetch(`/api/signals/${signalId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('Failed to dismiss signal:', err);
    }
  };

  return (
    <div>
      <div className="panel-header">
        <h3>
          <Zap size={14} />
          Active Signals ({activeSignals.length})
        </h3>
      </div>
      <div className="panel-body">
        {activeSignals.length === 0 ? (
          <div className="empty-state">
            <Zap size={24} style={{ color: '#484f58' }} />
            <p>No active signals detected</p>
          </div>
        ) : (
          activeSignals.map((signal, i) => (
            <SignalCard
              key={signal.id || i}
              signal={signal}
              onExecute={handleExecute}
              onDismiss={handleDismiss}
            />
          ))
        )}
      </div>
    </div>
  );
}
