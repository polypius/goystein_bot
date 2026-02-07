import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = window.location.origin.includes('localhost')
  ? 'http://localhost:8000'
  : window.location.origin;
const WS_BASE = API_BASE.replace(/^http/, 'ws');

const DEFAULT_STATE = {
  prices: {},
  price_changes: {},
  indicators: {},
  markets: [],
  signals: [],
  positions: [],
  recent_trades: [],
  strategy: {
    name: 'Combined',
    template: 'combined',
    rules: [],
    min_edge: 2.0,
    price_move_threshold: 0.5,
    volume_filter: 0,
    min_time_remaining: 2.0,
    profit_target_pct: 20.0,
    stop_loss_pct: 15.0,
    time_exit_minutes: 12.0,
    trailing_stop_pct: 0,
    scale_out_pct: 0,
    sizing_mode: 'fixed',
    fixed_amount: 100,
    bankroll_pct: 5,
    max_position: 500,
    max_concurrent: 5,
    max_capital_deployed: 2000,
    daily_loss_limit: 500,
    max_drawdown_pct: 20,
    cooldown_seconds: 60,
    blacklisted_markets: [],
    execution_mode: 'paper',
    order_type: 'market',
    slippage_tolerance: 2,
    require_confirmation: false,
    auto_rebalance: false,
    mean_reversion_threshold: 1.5,
    latency_threshold_ms: 500,
    confidence_threshold: 5,
  },
  pnl_today: 0,
  pnl_total: 0,
  win_rate: 0,
  total_trades: 0,
  balance: 10000,
  system: {
    exchange_feeds: {},
    polymarket: { source: 'polymarket', connected: false, status: 'disconnected' },
  },
  timestamp: 0,
};

export default function useWebSocket() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [status, setStatus] = useState('disconnected');
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    setStatus('connecting');

    try {
      const ws = new WebSocket(`${WS_BASE}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setState(data);
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };

      ws.onclose = () => {
        setStatus('disconnected');
        wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => ws.close();
    } catch {
      setStatus('disconnected');
      scheduleReconnect();
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return;
    const attempt = reconnectAttemptsRef.current;
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    reconnectAttemptsRef.current += 1;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connect();
    }, delay);
  }, [connect]);

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { state, status, send };
}

export { API_BASE };
