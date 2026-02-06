import React, { useState } from 'react';
import {
  Activity,
  BarChart3,
  FileText,
  Heart,
  FlaskConical,
} from 'lucide-react';
import useWebSocket from './hooks/useWebSocket';
import PricePanel from './components/PricePanel';
import SignalPanel from './components/SignalPanel';
import PositionPanel from './components/PositionPanel';
import StrategyPanel from './components/StrategyPanel';
import TradesPanel from './components/TradesPanel';
import HealthPanel from './components/HealthPanel';
import BacktestPanel from './components/BacktestPanel';

const STRATEGIES = [
  { id: 'mean_reversion', label: 'Mean Reversion' },
  { id: 'momentum', label: 'Momentum' },
  { id: 'arbitrage', label: 'Cross-Exchange Arb' },
  { id: 'polymarket_edge', label: 'Polymarket Edge' },
  { id: 'custom', label: 'Custom' },
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

function SignalLog({ logs }) {
  const entries = logs || [];
  if (entries.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 24 }}>
        <p>No log entries</p>
      </div>
    );
  }

  return (
    <div>
      {entries.map((entry, i) => (
        <div className="log-entry" key={i}>
          <span className="log-time">{entry.time || '--:--:--'}</span>
          <span className={`log-level-${entry.level || 'info'}`} style={{ fontWeight: 600, minWidth: 44 }}>
            [{(entry.level || 'INFO').toUpperCase()}]
          </span>
          <span className="log-message">{entry.message || ''}</span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const { state, status } = useWebSocket('ws://localhost:8000/ws');
  const [bottomTab, setBottomTab] = useState('trades');

  const mode = state.mode || state.strategy_config?.execution?.mode || 'paper';
  const isPaper = mode !== 'live';
  const pnl = state.pnl || {};

  const handleStrategyChange = async (e) => {
    const strategy = e.target.value;
    try {
      await fetch('/api/strategy/select', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy }),
      });
    } catch (err) {
      console.error('Failed to change strategy:', err);
    }
  };

  const renderBottomContent = () => {
    switch (bottomTab) {
      case 'trades':
        return <TradesPanel trades={state.trades} pnlHistory={state.pnl_history} />;
      case 'pnl':
        return <TradesPanel trades={[]} pnlHistory={state.pnl_history} />;
      case 'log':
        return <SignalLog logs={state.signal_log} />;
      case 'health':
        return <HealthPanel health={state.health} />;
      case 'backtest':
        return <BacktestPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="app">
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
            value={state.strategy || 'mean_reversion'}
            onChange={handleStrategyChange}
          >
            {STRATEGIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="top-bar-center">
          <div className="metric">
            <span className="metric-label">Total P&L</span>
            <span className={`metric-value ${pnlClass(pnl.total)}`}>
              {formatPnl(pnl.total)}
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">Today</span>
            <span className={`metric-value ${pnlClass(pnl.today)}`}>
              {formatPnl(pnl.today)}
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">Win Rate</span>
            <span className={`metric-value ${(pnl.win_rate || 0) >= 0.5 ? 'positive' : 'negative'}`}>
              {((pnl.win_rate || 0) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">Trades</span>
            <span className="metric-value neutral">{pnl.trades_count || 0}</span>
          </div>
        </div>

        <div className="top-bar-right">
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
        {/* Left Panel: Prices */}
        <PricePanel
          prices={state.prices}
          polymarket={state.polymarket}
          divergence={state.divergence}
        />

        {/* Center Panel: Signals + Positions */}
        <div className="panel center-panel">
          <SignalPanel signals={state.signals} />
          <div style={{ borderTop: '1px solid #30363d' }}>
            <PositionPanel positions={state.positions} />
          </div>
        </div>

        {/* Right Panel: Strategy Config */}
        <StrategyPanel config={state.strategy_config} />

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
                  <Icon size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
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
