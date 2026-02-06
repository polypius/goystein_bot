# Goystein Bot

High-speed Polymarket trading bot for ETH and BTC 15-minute binary outcome markets with a flexible, strategy-agnostic rule system.

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌───────────────┐
│  Exchange    │    │  Polymarket  │    │   React UI    │
│  WebSockets  │    │  API Poller  │    │  (Dashboard)  │
│  Binance     │    │              │    │               │
│  Coinbase    │    │  Markets     │    │  Strategy     │
│  Kraken      │    │  Odds        │    │  Config       │
└──────┬───────┘    └──────┬───────┘    └───────┬───────┘
       │                   │                    │
       ▼                   ▼                    ▼
┌──────────────────────────────────────────────────────┐
│                  FastAPI Backend                      │
│  ┌────────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │   Price    │  │ Strategy │  │    Execution     │ │
│  │ Aggregator │→ │  Engine  │→ │    Manager       │ │
│  │  + VWAP    │  │  Rules   │  │  Paper / Live    │ │
│  │  + Indic.  │  │  Signals │  │  Position Mgmt   │ │
│  └────────────┘  └──────────┘  └──────────────────┘ │
│                       ↕              ↕               │
│              ┌──────────────┐ ┌──────────────┐       │
│              │ Risk Manager │ │  Backtester  │       │
│              └──────────────┘ └──────────────┘       │
└──────────────────────────────────────────────────────┘
```

## Quick Start

### Option 1: Docker (recommended)

```bash
cp .env.example .env
# Edit .env with your Polymarket API keys (optional for paper mode)
docker compose up --build
```

Open http://localhost:8000 for the dashboard.

### Option 2: Local Development

```bash
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
python -m bot.main

# Frontend (in a separate terminal)
cd frontend
npm install
npm start
```

## Configuration

All settings are in `.env` (see `.env.example`):

| Variable | Description | Default |
|----------|-------------|---------|
| `EXECUTION_MODE` | `paper` or `live` | `paper` |
| `PAPER_BALANCE` | Starting virtual balance | `10000` |
| `POLYMARKET_API_KEY` | Polymarket CLOB API key | (empty) |
| `DATABASE_URL` | PostgreSQL connection | `postgresql+asyncpg://...` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379/0` |

## Strategy System

The bot is **strategy-agnostic** — you define the trading logic, the system executes it.

### Pre-built Templates

| Template | Description |
|----------|-------------|
| **Latency Arbitrage** | Buy when Polymarket odds lag behind exchange price moves |
| **Mean Reversion** | Fade sharp price moves, expecting reversion |
| **Momentum** | Ride strong directional trends |
| **Combined** | Mix of all three strategies |
| **Blank** | Build your own from scratch |

### Rule Builder

Each rule consists of conditions combined with AND/OR logic:

```
IF [price_change_30s] [greater than] [1.5%]
AND [polymarket_odds_change] [absolute value less than] [2%]
AND [time_remaining] [greater than] [10 min]
THEN BUY [NO] with [50%] of max position
```

### Available Metrics

**Exchange Data:** price changes (5s-5m), velocity, acceleration, volatility, SMA, RSI, bid-ask spread, VWAP

**Polymarket Data:** YES/NO prices, odds change, time remaining, divergence, implied probability

### Strategy Panels

1. **Strategy Builder** — Create/edit rules with conditions
2. **Entry Rules** — Minimum edge, price thresholds, volume/time filters
3. **Exit Rules** — Profit target, stop loss, time exit, trailing stop
4. **Position Sizing** — Fixed, % of bankroll, or Kelly Criterion
5. **Risk Management** — Max positions, capital limits, daily loss limit, drawdown pause
6. **Execution** — Paper/live mode, order type, slippage tolerance
7. **Parameter Tuning** — Fine-tune thresholds with sliders

## API Reference

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/strategy` | Get current strategy config |
| PUT | `/api/strategy` | Update strategy config |
| POST | `/api/strategy/template/{name}` | Load a template |
| GET | `/api/strategy/metrics` | List available metrics |
| GET | `/api/signals` | Recent signals |
| POST | `/api/signals/execute` | Execute a signal |
| GET | `/api/positions` | Open positions |
| POST | `/api/positions/close` | Close a position |
| GET | `/api/trades` | Recent trades |
| GET | `/api/analytics` | P&L and win rate |
| GET | `/api/risk` | Risk status |
| POST | `/api/backtest` | Run a backtest |
| GET | `/api/health` | System health |

### WebSocket

Connect to `ws://localhost:8000/ws` to receive real-time dashboard state updates (every 500ms).

## Paper Trading

The bot starts in **paper mode** by default with $10,000 virtual USDC. All signals are logged and simulated trades tracked with full P&L calculation. Switch to live mode only after validating your strategy.

## Backtesting

Send a POST to `/api/backtest` with optional strategy config and parameters:

```json
{
  "strategy": { ... },
  "interval": "1m",
  "limit": 1000
}
```

Returns: win rate, profit factor, Sharpe ratio, max drawdown, equity curve, and individual trades.

## Data Sources

- **Binance** — ETH/USDT, BTC/USDT via WebSocket ticker
- **Coinbase** — ETH-USD, BTC-USD via WebSocket ticker
- **Kraken** — ETH/USD, XBT/USD via WebSocket ticker
- **Polymarket** — Gamma API for market discovery, CLOB API for prices/orders

## Project Structure

```
bot/
├── main.py              # FastAPI app entry point
├── config.py            # Environment-based settings
├── models.py            # Shared data models
├── orchestrator.py      # Central coordinator
├── data/
│   ├── price_feed.py    # Exchange WebSocket feeds + aggregation
│   └── indicators.py    # Technical indicator computation
├── polymarket/
│   ├── client.py        # Polymarket API client
│   └── executor.py      # Order execution (paper + live)
├── strategy/
│   ├── engine.py        # Rule evaluation engine
│   ├── templates.py     # Pre-built strategy templates
│   └── serializer.py    # JSON import/export
├── execution/
│   └── manager.py       # Position & trade management
├── risk/
│   └── manager.py       # Risk checks & limits
├── backtest/
│   ├── engine.py        # Backtesting engine
│   └── data_loader.py   # Historical data from Binance
└── api/
    └── routes.py        # REST + WebSocket endpoints
frontend/
├── src/
│   ├── App.js           # Main dashboard layout
│   ├── components/      # UI panels
│   └── hooks/           # WebSocket hook
docker-compose.yml
Dockerfile
```
