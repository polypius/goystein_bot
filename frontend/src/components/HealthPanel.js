import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';

function getStatusColor(status) {
  switch (status) {
    case 'connected':
    case 'healthy':
    case 'ok':
      return 'green';
    case 'degraded':
    case 'slow':
    case 'warning':
      return 'yellow';
    case 'disconnected':
    case 'error':
    case 'down':
    default:
      return 'red';
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'connected':
    case 'healthy':
    case 'ok':
      return 'Connected';
    case 'degraded':
    case 'slow':
    case 'warning':
      return 'Degraded';
    case 'disconnected':
    case 'error':
    case 'down':
      return 'Disconnected';
    default:
      return status || 'Unknown';
  }
}

export default function HealthPanel({ health }) {
  const connections = health?.connections || [];

  if (connections.length === 0) {
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

  return (
    <div>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8, fontWeight: 600 }}>
        System Health
      </div>
      {connections.map((conn, i) => {
        const color = getStatusColor(conn.status);
        return (
          <div className="health-row" key={conn.name || i}>
            <span className={`health-dot ${color}`} />
            <span className="health-name">
              {conn.name}
              {conn.type && (
                <span style={{ fontSize: 10, color: '#484f58', marginLeft: 6 }}>
                  {conn.type}
                </span>
              )}
            </span>
            <span className="health-latency">
              {conn.latency_ms != null ? `${conn.latency_ms}ms` : '--'}
            </span>
            <span
              style={{
                fontSize: 11,
                marginLeft: 8,
                color:
                  color === 'green'
                    ? '#3fb950'
                    : color === 'yellow'
                    ? '#d29922'
                    : '#f85149',
              }}
            >
              {getStatusLabel(conn.status)}
            </span>
          </div>
        );
      })}

      <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 11, color: '#484f58' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="health-dot green" style={{ width: 6, height: 6 }} /> Healthy
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
