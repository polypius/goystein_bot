import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Activity,
  BarChart3,
  FileText,
  Heart,
  FlaskConical,
  Download,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import useWebSocket from './hooks/useWebSocket';
import { API_BASE } from './hooks/useWebSocket';
import PricePanel from './components/PricePanel';
import SignalPanel from './components/SignalPanel';
import PositionPanel from './components/PositionPanel';
import StrategyPanel from './components/StrategyPanel';
import TradesPanel from './components/TradesPanel';
import HealthPanel from './components/HealthPanel';
import BacktestPanel from './components/BacktestPanel';

const TEMPLATES = [
  { id: 'latency_arbitrage', label: 'Latency Arbitrage' },
  { id: 'mean_reversion', label: 'Mean Reversion' },
  { id: 'momentum', label: 'Momentum' },
  { id: 'combined', label: 'Combined' },
  { id: 'blank', label: 'Blank' },
];

const BOTTOM_TABS = [
  { id: 'trades', label: 'Recent Trades', icon: BarChart3 },
  { id: 'pnl', label: 'P&L Chart', icon: Activity },
  { id: 'log', label: 'Signal Log', icon: FileText },
  { id: 'health', label: 'System Health', icon: Heart },
  { id: 'backtest', label: 'Backtest', icon: FlaskConical },
];

function formatPnl(value) {
  if (value == null) return '$0.00';
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}$${Math.abs(value).toFixed(2)}`;
}

function pnlClass(value) {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function SignalLog({ signals }) {
  const entries = signals || [];
  if (entries.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 24 }}>
        <p>No log entries</p>
      </div>
    );
  }

  return (
    <div>
      {entries.map((entry, i) => {
        const time = entry.timestamp
          ? new Date(entry.timestamp * 1000).toLocaleTimeString()
          : '--:--:--';
        return (
          <div className="log-entry" key={entry.id || i}>
            <span className="log-time">{time}</span>
            <span
              className={`log-level-${entry.direction || 'info'}`}
              style={{ fontWeight: 600, minWidth: 44 }}
            >
              [{(entry.rule_name || entry.direction || 'INFO').toUpperCase()}]
            </span>
            <span className="log-message">
              {entry.explanation ||
                `${entry.asset} ${entry.direction} - ${entry.side} @ confidence ${entry.confidence}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ToastNotification({ toast, onDismiss }) {
  if (!toast) return null;

  const isError = toast.type === 'error';

  return (
    <div
      style={{
        position: 'fixed',
        top: 60,
        right: 20,
        zIndex: 9999,
        padding: '10px 16px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        background: isError
          ? 'rgba(248, 81, 73, 0.15)'
          : 'rgba(63, 185, 80, 0.15)',
        border: `1px solid ${
          isError ? 'rgba(248, 81, 73, 0.4)' : 'rgba(63, 185, 80, 0.4)'
        }`,
        color: isError ? '#f85149' : '#3fb950',
        animation: 'fadeIn 0.2s ease-in',
      }}
    >
      <span>{toast.message}</span>
      <button
        onClick={onDismiss}
        style={{
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function App() {
  const { state, status } = useWebSocket();
  const [bottomTab, setBottomTab] = useState('trades');
  const [toast, setToast] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const toastTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const prevSignalCountRef = useRef(0);

  // Derive mode from strategy.execution_mode
  const mode = state.strategy?.execution_mode || 'paper';
  const isPaper = mode !== 'live';
  const strategyName = state.strategy?.name || 'Strategy';
  const templateId = state.strategy?.template || 'combined';

  // --- Toast helpers ---

  const showToast = useCallback((message, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  // --- Sound notification on new signals ---

  useEffect(() => {
    const currentCount = (state.signals || []).length;
    if (
      soundEnabled &&
      currentCount > prevSignalCountRef.current &&
      prevSignalCountRef.current >= 0
    ) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.value = 0.1;
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } catch {
        // Audio not available
      }
    }
    prevSignalCountRef.current = currentCount;
  }, [state.signals, soundEnabled]);

  // --- API handlers ---

  const handleTemplateChange = async (e) => {
    const template = e.target.value;
    try {
      const resp = await fetch(
        `${API_BASE}/api/strategy/template/${template}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(body || `Failed to load template (${resp.status})`);
      }
      showToast(`Loaded template: ${template}`);
    } catch (err) {
      console.error('Failed to load template:', err);
      showToast(err.message, 'error');
    }
  };

  const handleExportStrategy = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/strategy/export`);
      if (!resp.ok) {
        throw new Error(`Export failed (${resp.status})`);
      }
      const data = await resp.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `strategy_${strategyName
        .replace(/\s+/g, '_')
        .toLowerCase()}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Strategy exported');
    } catch (err) {
      console.error('Export error:', err);
      showToast(err.message, 'error');
    }
  };

  const handleImportStrategy = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      const resp = await fetch(`${API_BASE}/api/strategy/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(body || `Import failed (${resp.status})`);
      }
      showToast('Strategy imported');
    } catch (err) {
      console.error('Import error:', err);
      showToast(err.message, 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExecuteSignal = async (signalId) => {
    try {
      const resp = await fetch(`${API_BASE}/api/signals/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_id: signalId }),
      });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(body || `Execute failed (${resp.status})`);
      }
      showToast('Signal executed');
    } catch (err) {
      console.error('Execute signal error:', err);
      showToast(err.message, 'error');
    }
  };

  const handleClosePosition = async (positionId) => {
    try {
      const resp = await fetch(`${API_BASE}/api/positions/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_id: positionId }),
      });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(body || `Close failed (${resp.status})`);
      }
      showToast('Position closed');
    } catch (err) {
      console.error('Close position error:', err);
      showToast(err.message, 'error');
    }
  };

  // --- Bottom tab rendering ---

  const renderBottomContent = () => {
    switch (bottomTab) {
      case 'trades':
        return <TradesPanel trades={state.recent_trades} />;
      case 'pnl':
        return <TradesPanel trades={[]} />;
      case 'log':
        return <SignalLog signals={state.signals} />;
      case 'health':
        return <HealthPanel system={state.system} />;
      case 'backtest':
        return (
          <BacktestPanel strategy={state.strategy} showToast={showToast} />
        );
      default:
        return null;
    }
  };

  return (
    <div className="app">
      {/* Toast Notifications */}
      <ToastNotification toast={toast} onDismiss={dismissToast} />

      {/* Hidden file input for strategy import */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImportStrategy}
      />

      {/* Mode Banner */}
      <div className={`mode-banner ${isPaper ? 'paper' : 'live'}`}>
        {isPaper
          ? 'PAPER TRADING MODE -- No real funds at risk'
          : 'LIVE TRADING MODE -- Real funds active'}
      </div>

      {/* Top Bar */}
      <div className="top-bar">
        <div className="top-bar-left">
          <span className="logo">Goystein Bot</span>
          <select
            className="strategy-select"
            value={templateId}
            onChange={handleTemplateChange}
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            className="btn btn-outline btn-sm"
            onClick={handleExportStrategy}
            title="Export strategy config"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Download size={12} />
            Save
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => fileInputRef.current?.click()}
            title="Import strategy config"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Upload size={12} />
            Load
          </button>
        </div>

        <div className="top-bar-center">
          <div className="metric">
            <span className="metric-label">Strategy</span>
            <span className="metric-value neutral">{strategyName}</span>
          </div>
          <div className="metric">
            <span className="metric-label">P&L Today</span>
            <span className={`metric-value ${pnlClass(state.pnl_today)}`}>
              {formatPnl(state.pnl_today)}
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">P&L Total</span>
            <span className={`metric-value ${pnlClass(state.pnl_total)}`}>
              {formatPnl(state.pnl_total)}
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">Win Rate</span>
            <span
              className={`metric-value ${
                (state.win_rate || 0) >= 0.5 ? 'positive' : 'negative'
              }`}
            >
              {((state.win_rate || 0) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">Trades</span>
            <span className="metric-value neutral">
              {state.total_trades || 0}
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">Balance</span>
            <span className="metric-value neutral">
              $
              {(state.balance || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          {state.eth_btc_correlation != null && (
            <div className="metric">
              <span className="metric-label">ETH/BTC Corr</span>
              <span className={`metric-value ${Math.abs(state.eth_btc_correlation) > 0.7 ? 'positive' : 'neutral'}`}>
                {(state.eth_btc_correlation || 0).toFixed(3)}
              </span>
            </div>
          )}
        </div>

        <div className="top-bar-right">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setSoundEnabled((prev) => !prev)}
            title={
              soundEnabled
                ? 'Mute notifications'
                : 'Enable sound notifications'
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 8px',
            }}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <div className="ws-status">
            <span
              className={`ws-dot ${
                status === 'connected'
                  ? 'connected'
                  : status === 'connecting'
                  ? 'connecting'
                  : 'disconnected'
              }`}
            />
            {status === 'connected'
              ? 'Live'
              : status === 'connecting'
              ? 'Connecting...'
              : 'Offline'}
          </div>
          <span
            style={{
              padding: '4px 12px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 700,
              background: isPaper
                ? 'rgba(210, 153, 34, 0.15)'
                : 'rgba(248, 81, 73, 0.15)',
              color: isPaper ? '#d29922' : '#f85149',
            }}
          >
            {isPaper ? 'PAPER' : 'LIVE'}
          </span>
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className="dashboard-grid with-banner">
        {/* Left Panel: Prices + Markets */}
        <PricePanel
          prices={state.prices}
          markets={state.markets}
          priceChanges={state.price_changes}
          indicators={state.indicators}
        />

        {/* Center Panel: Signals + Positions */}
        <div className="panel center-panel">
          <SignalPanel
            signals={state.signals}
            onExecute={handleExecuteSignal}
          />
          <div style={{ borderTop: '1px solid #30363d' }}>
            <PositionPanel
              positions={state.positions}
              onClose={handleClosePosition}
            />
          </div>
        </div>

        {/* Right Panel: Strategy Config */}
        <StrategyPanel config={state.strategy} showToast={showToast} />

        {/* Bottom Panel: Trades, Charts, Logs, Health, Backtest */}
        <div className="panel bottom-panel">
          <div className="tabs">
            {BOTTOM_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  className={`tab ${bottomTab === tab.id ? 'active' : ''}`}
                  onClick={() => setBottomTab(tab.id)}
                >
                  <Icon
                    size={12}
                    style={{ marginRight: 4, verticalAlign: 'middle' }}
                  />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="bottom-tabs-content">{renderBottomContent()}</div>
        </div>
      </div>
    </div>
  );
}
