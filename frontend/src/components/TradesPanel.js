import React from 'react';
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
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: 12,
      }}
    >
      <div style={{ color: '#8b949e', marginBottom: 4 }}>{label}</div>
      {payload.map((entry, i) => (
        <div key={i} style={{ color: entry.color, fontFamily: 'monospace' }}>
          {entry.name}: ${Number(entry.value).toFixed(2)}
        </div>
      ))}
    </div>
  );
}

function PnLChart({ data }) {
  const chartData = (data || []).map((d) => ({
    time: d.time || d.timestamp || '',
    pnl: d.cumulative_pnl || d.pnl || 0,
  }));

  if (chartData.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 24 }}>
        <p>No P&L data yet</p>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
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
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#30363d" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="pnl"
            name="P&L"
            stroke="#58a6ff"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#58a6ff' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TradesTable({ trades }) {
  if (!trades || trades.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 24 }}>
        <p>No recent trades</p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="trades-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Market</th>
            <th>Side</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>Size</th>
            <th>P&L</th>
            <th>Strategy</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade, i) => {
            const pnl = trade.pnl || 0;
            const isPositive = pnl >= 0;
            return (
              <tr key={trade.id || i}>
                <td style={{ color: '#8b949e', fontSize: 11 }}>
                  {trade.time || trade.closed_at || '--'}
                </td>
                <td>{trade.market || 'ETH/USD'}</td>
                <td>
                  <span
                    style={{
                      color: trade.side === 'long' ? '#3fb950' : '#f85149',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    {trade.side === 'long' ? (
                      <ArrowUpRight size={12} />
                    ) : (
                      <ArrowDownRight size={12} />
                    )}
                    {(trade.side || 'long').toUpperCase()}
                  </span>
                </td>
                <td>
                  ${Number(trade.entry_price || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td>
                  ${Number(trade.exit_price || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td>${(trade.size || 0).toFixed(2)}</td>
                <td style={{ color: isPositive ? '#3fb950' : '#f85149', fontWeight: 600 }}>
                  {isPositive ? '+' : ''}${pnl.toFixed(2)}
                </td>
                <td style={{ color: '#8b949e', fontSize: 11 }}>
                  {trade.strategy || '--'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function TradesPanel({ trades, pnlHistory }) {
  return (
    <div>
      <TradesTable trades={trades} />
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8, fontWeight: 600 }}>
          Cumulative P&L
        </div>
        <PnLChart data={pnlHistory} />
      </div>
    </div>
  );
}
