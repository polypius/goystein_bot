import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

function PnLChart({ trades }) {
  if (!trades || trades.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 24 }}>
        <p>No P&L data yet</p>
      </div>
    );
  }

  let cumPnl = 0;
  const chartData = trades
    .filter(t => t.direction === 'close')
    .map((t) => {
      cumPnl += t.pnl || 0;
      const ts = t.timestamp ? new Date(t.timestamp * 1000) : new Date();
      return {
        time: ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        pnl: Math.round(cumPnl * 100) / 100,
      };
    });

  if (chartData.length === 0) return null;

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
          <XAxis dataKey="time" stroke="#484f58" tick={{ fontSize: 10, fill: '#8b949e' }} tickLine={false} />
          <YAxis stroke="#484f58" tick={{ fontSize: 10, fill: '#8b949e' }} tickLine={false} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: '#8b949e' }}
          />
          <ReferenceLine y={0} stroke="#30363d" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="pnl" name="P&L" stroke="#58a6ff" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#58a6ff' }} />
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
            <th>Asset</th>
            <th>Side</th>
            <th>Type</th>
            <th>Price</th>
            <th>Size</th>
            <th>P&L</th>
            <th>Rule</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade, i) => {
            const pnl = trade.pnl || 0;
            const isPositive = pnl >= 0;
            const ts = trade.timestamp ? new Date(trade.timestamp * 1000) : null;
            const timeStr = ts
              ? ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : '--';
            return (
              <tr key={trade.id || i}>
                <td style={{ color: '#8b949e', fontSize: 11 }}>{timeStr}</td>
                <td>{trade.asset || '-'}</td>
                <td>
                  <span style={{
                    color: trade.side === 'YES' ? '#3fb950' : '#f85149',
                    display: 'inline-flex', alignItems: 'center', gap: 2,
                  }}>
                    {trade.side === 'YES' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {trade.side || '-'}
                  </span>
                </td>
                <td style={{ color: '#8b949e', fontSize: 11 }}>{trade.direction || '-'}</td>
                <td>{((trade.price || 0) * 100).toFixed(1)}c</td>
                <td>${(trade.size || 0).toFixed(2)}</td>
                <td style={{ color: isPositive ? '#3fb950' : '#f85149', fontWeight: 600 }}>
                  {trade.direction === 'close' ? `${isPositive ? '+' : ''}$${pnl.toFixed(2)}` : '-'}
                </td>
                <td style={{ color: '#8b949e', fontSize: 11 }}>{trade.rule_name || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function TradesPanel({ trades }) {
  return (
    <div>
      <TradesTable trades={trades} />
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8, fontWeight: 600 }}>
          Cumulative P&L
        </div>
        <PnLChart trades={trades} />
      </div>
    </div>
  );
}
