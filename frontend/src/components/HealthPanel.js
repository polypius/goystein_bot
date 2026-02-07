import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';

function getStatusColor(status) {
  if (status === 'connected') return 'green';
  if (status === 'degraded') return 'yellow';
  return 'red';
}

export default function HealthPanel({ system }) {
  if (!system) {
    return (
      <div>
        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8, fontWeight: 600 }}>
          System Health
        </div>
        <div className="empty-state" style={{ padding: 16 }}>
          <WifiOff size={20} style={{ color: '#484f58' }} />
          <p>No connection data</p>
        </div>
      </div>
    );
  }

  const feeds = system.exchange_feeds || {};
  const polymarket = system.polymarket || {};

  const connections = [
    ...Object.entries(feeds).map(([name, health]) => ({
      name,
      type: 'Exchange',
      ...health,
    })),
    { name: 'Polymarket', type: 'API', ...polymarket },
  ];

  if (connections.length === 0) {
    return (
      <div>
        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8, fontWeight: 600 }}>
          System Health
        </div>
        <div className="empty-state" style={{ padding: 16 }}>
          <WifiOff size={20} style={{ color: '#484f58' }} />
          <p>Waiting for connections...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8, fontWeight: 600 }}>
        System Health
      </div>
      {connections.map((conn, i) => {
        const color = getStatusColor(conn.status);
        const lastMsg = conn.last_message
          ? new Date(conn.last_message * 1000).toLocaleTimeString()
          : '--';
        return (
          <div className="health-row" key={conn.name || i}>
            <span className={`health-dot ${color}`} />
            <span className="health-name">
              {conn.name}
              <span style={{ fontSize: 10, color: '#484f58', marginLeft: 6 }}>
                {conn.type}
              </span>
            </span>
            <span className="health-latency">
              {conn.latency_ms != null ? `${conn.latency_ms.toFixed(0)}ms` : '--'}
            </span>
            <span style={{ fontSize: 10, color: '#484f58', marginLeft: 4 }}>
              Last: {lastMsg}
            </span>
            <span style={{
              fontSize: 11, marginLeft: 8,
              color: color === 'green' ? '#3fb950' : color === 'yellow' ? '#d29922' : '#f85149',
            }}>
              {conn.status || 'unknown'}
            </span>
            {conn.error_count > 0 && (
              <span style={{ fontSize: 10, color: '#f85149', marginLeft: 4 }}>
                ({conn.error_count} errors)
              </span>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 11, color: '#484f58' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="health-dot green" style={{ width: 6, height: 6 }} /> Connected
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="health-dot yellow" style={{ width: 6, height: 6 }} /> Degraded
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="health-dot red" style={{ width: 6, height: 6 }} /> Down
        </span>
      </div>
    </div>
  );
}
