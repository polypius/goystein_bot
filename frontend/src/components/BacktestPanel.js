import React, { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { FlaskConical, Play, Loader } from 'lucide-react';
import { API_BASE } from '../hooks/useWebSocket';

function EquityCurveChart({ data }) {
  if (!data || data.length === 0) return null;

  const chartData = data.map(([ts, equity]) => ({
    time: new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    equity: Math.round(equity * 100) / 100,
  }));

  return (
    <div className="chart-container" style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8, fontWeight: 600 }}>
        Equity Curve
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
          <XAxis dataKey="time" stroke="#484f58" tick={{ fontSize: 10, fill: '#8b949e' }} tickLine={false} />
          <YAxis stroke="#484f58" tick={{ fontSize: 10, fill: '#8b949e' }} tickLine={false} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: '#8b949e' }}
          />
          <ReferenceLine y={10000} stroke="#30363d" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="equity" name="Equity" stroke="#bc8cff" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#bc8cff' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="backtest-stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: color || '#c9d1d9' }}>{value}</div>
    </div>
  );
}

export default function BacktestPanel({ strategy, showToast }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [interval, setInterval_] = useState('1m');
  const [limit, setLimit] = useState(1000);
  const [error, setError] = useState(null);

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/api/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval, limit }),
      });
      if (!resp.ok) throw new Error(`Backtest failed: ${resp.status}`);
      const data = await resp.json();
      setResults(data);
      showToast?.(`Backtest complete: ${data.total_trades} trades`);
    } catch (err) {
      setError(err.message);
      showToast?.(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12, fontWeight: 600 }}>
        <FlaskConical size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
        Backtest - {strategy?.name || 'Current Strategy'}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={interval} onChange={(e) => setInterval_(e.target.value)} style={{ flex: 0 }}>
          <option value="1m">1-min bars</option>
          <option value="5m">5-min bars</option>
          <option value="15m">15-min bars</option>
        </select>
        <select value={limit} onChange={(e) => setLimit(parseInt(e.target.value))} style={{ flex: 0 }}>
          <option value={500}>500 bars</option>
          <option value={1000}>1000 bars</option>
          <option value={2000}>2000 bars (~1.5 days)</option>
        </select>
        <button className="btn btn-primary" onClick={runBacktest} disabled={loading} style={{ opacity: loading ? 0.6 : 1 }}>
          {loading ? (
            <><Loader size={14} style={{ animation: 'pulse 1s infinite' }} /> Running...</>
          ) : (
            <><Play size={14} /> Run Backtest</>
          )}
        </button>
      </div>

      {error && (
        <div style={{
          background: 'rgba(248, 81, 73, 0.1)', border: '1px solid rgba(248, 81, 73, 0.3)',
          borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#f85149', marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      {results && (
        <>
          <div className="backtest-results">
            <StatCard
              label="Win Rate"
              value={`${(results.win_rate || 0).toFixed(1)}%`}
              color={(results.win_rate || 0) >= 50 ? '#3fb950' : '#f85149'}
            />
            <StatCard
              label="Sharpe Ratio"
              value={(results.sharpe_ratio || 0).toFixed(2)}
              color={(results.sharpe_ratio || 0) >= 1 ? '#3fb950' : (results.sharpe_ratio || 0) >= 0 ? '#d29922' : '#f85149'}
            />
            <StatCard
              label="Max Drawdown"
              value={`$${(results.max_drawdown || 0).toFixed(2)}`}
              color="#f85149"
            />
            <StatCard
              label="Total P&L"
              value={`${(results.total_pnl || 0) >= 0 ? '+' : ''}$${(results.total_pnl || 0).toFixed(2)}`}
              color={(results.total_pnl || 0) >= 0 ? '#3fb950' : '#f85149'}
            />
            <StatCard
              label="Total Trades"
              value={results.total_trades || 0}
            />
            <StatCard
              label="Profit Factor"
              value={(results.profit_factor || 0).toFixed(2)}
              color={(results.profit_factor || 0) >= 1 ? '#3fb950' : '#f85149'}
            />
            <StatCard
              label="Avg Trade"
              value={`$${(results.avg_trade_pnl || 0).toFixed(2)}`}
              color={(results.avg_trade_pnl || 0) >= 0 ? '#3fb950' : '#f85149'}
            />
            <StatCard
              label="Best / Worst"
              value={`$${(results.best_trade || 0).toFixed(2)} / $${(results.worst_trade || 0).toFixed(2)}`}
            />
          </div>

          <EquityCurveChart data={results.equity_curve || []} />
        </>
      )}

      {!results && !loading && !error && (
        <div className="empty-state" style={{ padding: 24 }}>
          <FlaskConical size={24} style={{ color: '#484f58' }} />
          <p>Select parameters and run a backtest to see results</p>
        </div>
      )}
    </div>
  );
}
