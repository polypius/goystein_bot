import { useState, useEffect, useRef, useCallback } from 'react';

const DEFAULT_STATE = {
  mode: 'paper',
  strategy: 'mean_reversion',
  pnl: { total: 0, today: 0, win_rate: 0, trades_count: 0 },
  prices: {
    ETH: {
      exchanges: [],
      vwap: 0,
      change_24h: 0,
    },
    BTC: {
      exchanges: [],
      vwap: 0,
      change_24h: 0,
    },
  },
  polymarket: {
    markets: [],
  },
  divergence: {
    value: 0,
    level: 'low',
  },
  signals: [],
  positions: [],
  trades: [],
  pnl_history: [],
  signal_log: [],
  health: {
    connections: [],
  },
  strategy_config: {
    rules: [],
    entry: {
      min_edge: 0.02,
      price_threshold: 0.5,
      volume_filter: true,
      time_filter: true,
    },
    exit: {
      profit_target: 0.05,
      stop_loss: 0.03,
      time_exit_minutes: 60,
      trailing_stop: 0.02,
    },
    position_sizing: {
      mode: 'fixed',
      fixed_amount: 100,
      pct_amount: 5,
      kelly_fraction: 0.25,
      max_position: 1000,
    },
    risk: {
      max_concurrent: 3,
      max_capital: 5000,
      daily_loss_limit: 500,
      max_drawdown: 0.1,
      cooldown_minutes: 5,
    },
    execution: {
      mode: 'paper',
      order_type: 'limit',
      max_slippage: 0.005,
      confirmation: true,
    },
    tuning: {
      mean_reversion_threshold: 2.0,
      latency_threshold_ms: 100,
      confidence_threshold: 0.7,
    },
  },
};

export default function useWebSocket(url = 'ws://localhost:8000/ws') {
  const [state, setState] = useState(DEFAULT_STATE);
  const [status, setStatus] = useState('disconnected');
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectDelay = 30000;

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setState((prev) => ({ ...prev, ...data }));
        } catch (err) {
          console.error('WebSocket parse error:', err);
        }
      };

      ws.onclose = () => {
        setStatus('disconnected');
        wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws.close();
      };
    } catch (err) {
      console.error('WebSocket connection failed:', err);
      setStatus('disconnected');
      scheduleReconnect();
    }
  }, [url]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return;
    const attempt = reconnectAttemptsRef.current;
    const delay = Math.min(1000 * Math.pow(2, attempt), maxReconnectDelay);
    reconnectAttemptsRef.current += 1;

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connect();
    }, delay);
  }, [connect]);

  const send = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { state, status, send };
}
