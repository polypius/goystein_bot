import React, { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { FlaskConical, Play, Loader } from 'lucide-react';

function EquityCurveChart({ data }) {
  if (!data || data.length === 0) return null;

  return (
    <div className="chart-container" style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8, fontWeight: 600 }}>
        Equity Curve
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
          <XAxis
            dataKey="time"
            stroke="#484f58"
            tick={{ fontSize: 10, fill: '#8b949e' }}
            tickLine={false}
          />
          <YAxis
            stroke="#484f58"
            tick={{ fontSize: 10, fill: '#8b949e' }}
            tickLine={false}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip
            contentStyle={{
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: '#8b949e' }}
          />
          <ReferenceLine y={0} stroke="#30363d" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="equity"
            name="Equity"
            stroke="#bc8cff"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#bc8cff' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function BacktestPanel() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [period, setPeriod] = useState('30d');
  const [error, setError] = useState(null);

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      });
      if (!resp.ok) {
        throw new Error(`Backtest failed: ${resp.status}`);
      }
      const data = await resp.json();
      setResults(data);
    } catch (err) {
      console.error('Backtest error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12, fontWeight: 600 }}>
        <FlaskConical size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
        Backtest
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          style={{ flex: 0 }}
        >
          <option value="7d">7 Days</option>
          <option value="14d">14 Days</option>
          <option value="30d">30 Days</option>
          <option value="90d">90 Days</option>
          <option value="180d">180 Days</option>
          <option value="365d">1 Year</option>
        </select>
        <button
          className="btn btn-primary"
          onClick={runBacktest}
          disabled={loading}
          style={{ opacity: loading ? 0.6 : 1 }}
        >
          {loading ? (
            <>
              <Loader size={14} style={{ animation: 'pulse 1s infinite' }} />
              Running...
            </>
          ) : (
            <>
              <Play size={14} />
              Run Backtest
            </>
          )}
        </button>
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(248, 81, 73, 0.1)',
            border: '1px solid rgba(248, 81, 73, 0.3)',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 12,
            color: '#f85149',
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {results && (
        <>
          <div className="backtest-results">
            <div className="backtest-stat">
              <div className="stat-label">Win Rate</div>
              <div
                className="stat-value"
                style={{
                  color:
                    (results.win_rate || 0) >= 0.5 ? '#3fb950' : '#f85149',
                }}
              >
                {((results.win_rate || 0) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="backtest-stat">
              <div className="stat-label">Sharpe Ratio</div>
              <div
                className="stat-value"
                style={{
                  color:
                    (results.sharpe || 0) >= 1.0 ? '#3fb950' : (results.sharpe || 0) >= 0 ? '#d29922' : '#f85149',
                }}
              >
                {(results.sharpe || 0).toFixed(2)}
              </div>
            </div>
            <div className="backtest-stat">
              <div className="stat-label">Max Drawdown</div>
              <div className="stat-value" style={{ color: '#f85149' }}>
                {((results.max_drawdown || 0) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="backtest-stat">
              <div className="stat-label">Total P&L</div>
              <div
                className="stat-value"
                style={{
                  color:
                    (results.total_pnl || 0) >= 0 ? '#3fb950' : '#f85149',
                }}
              >
                ${(results.total_pnl || 0).toFixed(2)}
              </div>
            </div>
            <div className="backtest-stat">
              <div className="stat-label">Total Trades</div>
              <div className="stat-value" style={{ color: '#c9d1d9' }}>
                {results.total_trades || 0}
              </div>
            </div>
            <div className="backtest-stat">
              <div className="stat-label">Profit Factor</div>
              <div
                className="stat-value"
                style={{
                  color:
                    (results.profit_factor || 0) >= 1.0 ? '#3fb950' : '#f85149',
                }}
              >
                {(results.profit_factor || 0).toFixed(2)}
              </div>
            </div>
          </div>

          <EquityCurveChart data={results.equity_curve || []} />
        </>
      )}

      {!results && !loading && !error && (
        <div className="empty-state" style={{ padding: 24 }}>
          <FlaskConical size={24} style={{ color: '#484f58' }} />
          <p>Select a period and run a backtest to see results</p>
        </div>
      )}
    </div>
  );
}
