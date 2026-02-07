import React, { useState } from 'react';
import { Zap, Check, X, HelpCircle } from 'lucide-react';
import { API_BASE } from '../hooks/useWebSocket';

function SignalCard({ signal, onExecute, onDismiss }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [loading, setLoading] = useState(false);

  const confidence = signal.confidence || 0;
  const confidenceColor = confidence >= 7 ? '#3fb950' : confidence >= 4 ? '#d29922' : '#f85149';
  const dirLabel = signal.direction === 'up' ? 'UP' : 'DOWN';
  const dirClass = signal.direction === 'up' ? 'long' : 'short';

  const handleExecute = async () => {
    setLoading(true);
    await onExecute(signal.id);
    setLoading(false);
  };

  return (
    <div className="signal-card">
      <div className="signal-card-header">
        <span className={`signal-direction ${dirClass}`}>
          <Zap size={12} /> {signal.side} ({dirLabel})
        </span>
        <span className="signal-confidence" style={{ color: confidenceColor }}>
          {confidence.toFixed(0)}/10
        </span>
      </div>

      <div className="signal-details">
        <div className="signal-detail">
          <span className="label">Asset</span>
          <span className="value">{signal.asset || 'ETH'}</span>
        </div>
        <div className="signal-detail">
          <span className="label">Edge</span>
          <span className="value" style={{ color: '#3fb950' }}>
            {(signal.edge || 0).toFixed(2)}%
          </span>
        </div>
        <div className="signal-detail">
          <span className="label">Rule</span>
          <span className="value">{signal.rule_name || '-'}</span>
        </div>
        <div className="signal-detail">
          <span className="label">Market</span>
          <span className="value" title={signal.market?.question}>
            {signal.market?.question?.slice(0, 30) || '-'}
          </span>
        </div>
        <div className="signal-detail">
          <span className="label">YES Price</span>
          <span className="value">{((signal.market?.yes_price || 0) * 100).toFixed(1)}c</span>
        </div>
        <div className="signal-detail">
          <span className="label">Time Left</span>
          <span className="value">
            {signal.market?.end_time
              ? Math.max(0, (signal.market.end_time - Date.now() / 1000) / 60).toFixed(1) + 'm'
              : '-'}
          </span>
        </div>
      </div>

      <div className="signal-actions">
        <button className="btn btn-primary" onClick={handleExecute} disabled={loading}>
          <Check size={14} /> {loading ? 'Executing...' : 'Execute'}
        </button>
        <button className="btn btn-secondary" onClick={() => onDismiss(signal.id)}>
          <X size={14} /> Dismiss
        </button>
        <div
          className="signal-reason"
          style={{ marginLeft: 'auto', position: 'relative' }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <HelpCircle size={16} style={{ color: '#8b949e', cursor: 'pointer' }} />
          {showTooltip && (
            <div className="tooltip">
              <strong style={{ display: 'block', marginBottom: 4 }}>Why this trade?</strong>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, margin: 0 }}>
                {signal.explanation || `Rule "${signal.rule_name}" triggered with ${confidence}/10 confidence and ${(signal.edge || 0).toFixed(2)}% edge.`}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SignalPanel({ signals, onNotify }) {
  const [dismissed, setDismissed] = useState(new Set());
  const activeSignals = (signals || []).filter(s => !dismissed.has(s.id));

  const handleExecute = async (signalId) => {
    try {
      const res = await fetch(`${API_BASE}/api/signals/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_id: signalId }),
      });
      const data = await res.json();
      if (data.executed) {
        onNotify?.('Signal executed', 'success');
        setDismissed(prev => new Set([...prev, signalId]));
      } else {
        onNotify?.('Execution failed (risk check or expired)', 'error');
      }
    } catch (err) {
      onNotify?.(`Execute failed: ${err.message}`, 'error');
    }
  };

  const handleDismiss = (signalId) => {
    setDismissed(prev => new Set([...prev, signalId]));
  };

  return (
    <div>
      <div className="panel-header">
        <h3><Zap size={14} /> Signals ({activeSignals.length})</h3>
      </div>
      <div className="panel-body">
        {activeSignals.length === 0 ? (
          <div className="empty-state">
            <Zap size={24} style={{ color: '#484f58' }} />
            <p>No active signals</p>
          </div>
        ) : (
          activeSignals.slice(0, 10).map((signal, i) => (
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
