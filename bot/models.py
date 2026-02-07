"""Shared data models used across the application."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class Asset(str, Enum):
    ETH = "ETH"
    BTC = "BTC"


class Side(str, Enum):
    YES = "YES"
    NO = "NO"


class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"


class ExecutionMode(str, Enum):
    PAPER = "paper"
    LIVE = "live"


class SignalDirection(str, Enum):
    UP = "up"
    DOWN = "down"


class PositionStatus(str, Enum):
    OPEN = "open"
    CLOSED = "closed"


class StrategyTemplate(str, Enum):
    LATENCY_ARB = "latency_arbitrage"
    MEAN_REVERSION = "mean_reversion"
    MOMENTUM = "momentum"
    COMBINED = "combined"
    BLANK = "blank"


# ---------------------------------------------------------------------------
# Data-layer models
# ---------------------------------------------------------------------------

@dataclass
class PriceTick:
    exchange: str
    asset: Asset
    price: float
    volume_24h: float
    bid: float
    ask: float
    timestamp: float = field(default_factory=time.time)


@dataclass
class AggregatedPrice:
    asset: Asset
    vwap: float  # volume-weighted average price
    prices: dict[str, float] = field(default_factory=dict)  # exchange -> price
    volumes: dict[str, float] = field(default_factory=dict)
    spread: float = 0.0
    timestamp: float = field(default_factory=time.time)


@dataclass
class PriceChange:
    """Percentage price change over various lookback windows (seconds)."""
    asset: Asset
    pct_5s: float = 0.0
    pct_15s: float = 0.0
    pct_30s: float = 0.0
    pct_1m: float = 0.0
    pct_5m: float = 0.0
    velocity: float = 0.0  # rate of change per second
    acceleration: float = 0.0  # change of velocity


@dataclass
class Indicator:
    """Technical indicator snapshot."""
    asset: Asset
    sma_5m: float = 0.0
    sma_15m: float = 0.0
    sma_1h: float = 0.0
    rsi_14: float = 50.0
    volatility_5m: float = 0.0
    volatility_15m: float = 0.0
    momentum: float = 0.0
    timestamp: float = field(default_factory=time.time)


# ---------------------------------------------------------------------------
# Polymarket models
# ---------------------------------------------------------------------------

@dataclass
class PolymarketMarket:
    condition_id: str
    question: str
    asset: Asset
    strike_price: float  # e.g. 2500 for "ETH above $2500?"
    end_time: float  # unix timestamp when market resolves
    yes_price: float = 0.5
    no_price: float = 0.5
    yes_token_id: str = ""
    no_token_id: str = ""
    volume: float = 0.0
    liquidity: float = 0.0
    active: bool = True

    @property
    def implied_prob_up(self) -> float:
        return self.yes_price

    @property
    def time_remaining_s(self) -> float:
        return max(0.0, self.end_time - time.time())

    @property
    def time_remaining_min(self) -> float:
        return self.time_remaining_s / 60.0


# ---------------------------------------------------------------------------
# Strategy / Signal models
# ---------------------------------------------------------------------------

@dataclass
class Signal:
    id: str
    asset: Asset
    direction: SignalDirection
    side: Side  # buy YES or buy NO on Polymarket
    market: PolymarketMarket
    confidence: float  # 0-10
    edge: float  # estimated edge in %
    rule_name: str  # which strategy rule produced this
    explanation: str = ""
    timestamp: float = field(default_factory=time.time)
    indicators: dict[str, float] = field(default_factory=dict)


@dataclass
class ConditionConfig:
    """Single condition in a strategy rule (e.g. 'Price drops > 1.5% in 30s')."""
    metric: str  # e.g. "price_change_30s", "polymarket_odds_change", "time_remaining"
    operator: str  # gt, lt, gte, lte, eq, between
    value: float = 0.0
    value2: float = 0.0  # for 'between'


@dataclass
class RuleConfig:
    """One trading rule consisting of multiple conditions."""
    name: str
    conditions: list[ConditionConfig] = field(default_factory=list)
    logic: str = "AND"  # AND / OR
    action_side: str = "YES"  # YES or NO
    position_pct: float = 50.0  # % of max position size
    confidence: int = 5  # 1-10
    enabled: bool = True


@dataclass
class StrategyConfig:
    name: str = "Default"
    template: StrategyTemplate = StrategyTemplate.COMBINED
    rules: list[RuleConfig] = field(default_factory=list)

    # Entry
    min_edge: float = 2.0  # %
    price_move_threshold: float = 0.5  # %
    volume_filter: float = 0.0
    min_time_remaining: float = 2.0  # minutes

    # Exit
    profit_target_pct: float = 20.0
    stop_loss_pct: float = 15.0
    time_exit_minutes: float = 12.0
    trailing_stop_pct: float = 0.0
    scale_out_pct: float = 0.0  # take half at this %

    # Position sizing
    sizing_mode: str = "fixed"  # fixed, pct_bankroll, kelly
    fixed_amount: float = 100.0
    bankroll_pct: float = 5.0
    max_position: float = 500.0

    # Risk
    max_concurrent: int = 5
    max_capital_deployed: float = 2000.0
    daily_loss_limit: float = 500.0
    max_drawdown_pct: float = 20.0
    cooldown_seconds: float = 60.0
    blacklisted_markets: list[str] = field(default_factory=list)

    # Execution
    execution_mode: str = "paper"
    order_type: str = "market"
    slippage_tolerance: float = 2.0  # %
    require_confirmation: bool = False
    auto_rebalance: bool = False

    # Tuning
    mean_reversion_threshold: float = 1.5  # %
    latency_threshold_ms: float = 500.0
    confidence_threshold: float = 5.0
    lookback_5m: int = 300
    lookback_15m: int = 900
    lookback_1h: int = 3600


# ---------------------------------------------------------------------------
# Position / Trade models
# ---------------------------------------------------------------------------

@dataclass
class Position:
    id: str
    market: PolymarketMarket
    side: Side
    entry_price: float
    size: float  # in USDC
    quantity: float  # tokens
    status: PositionStatus = PositionStatus.OPEN
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0
    entry_time: float = field(default_factory=time.time)
    exit_time: float | None = None
    exit_price: float | None = None
    rule_name: str = ""
    peak_price: float = 0.0  # for trailing stop


@dataclass
class Trade:
    id: str
    position_id: str
    market_id: str
    asset: Asset
    side: Side
    direction: str  # "open" or "close"
    price: float
    size: float
    quantity: float
    pnl: float = 0.0
    timestamp: float = field(default_factory=time.time)
    rule_name: str = ""
    signal_confidence: float = 0.0


# ---------------------------------------------------------------------------
# System health
# ---------------------------------------------------------------------------

@dataclass
class ConnectionHealth:
    source: str
    connected: bool = False
    latency_ms: float = 0.0
    last_message: float = 0.0
    error_count: int = 0
    status: str = "disconnected"  # connected, degraded, disconnected


@dataclass
class SystemStatus:
    exchange_feeds: dict[str, ConnectionHealth] = field(default_factory=dict)
    polymarket: ConnectionHealth = field(default_factory=lambda: ConnectionHealth("polymarket"))
    database: ConnectionHealth = field(default_factory=lambda: ConnectionHealth("database"))
    redis: ConnectionHealth = field(default_factory=lambda: ConnectionHealth("redis"))


@dataclass
class DashboardState:
    """Full snapshot sent to frontend over WebSocket."""
    prices: dict[str, AggregatedPrice] = field(default_factory=dict)
    price_changes: dict[str, PriceChange] = field(default_factory=dict)
    indicators: dict[str, Indicator] = field(default_factory=dict)
    markets: list[PolymarketMarket] = field(default_factory=list)
    signals: list[Signal] = field(default_factory=list)
    positions: list[Position] = field(default_factory=list)
    recent_trades: list[Trade] = field(default_factory=list)
    strategy: StrategyConfig = field(default_factory=StrategyConfig)
    pnl_today: float = 0.0
    pnl_total: float = 0.0
    win_rate: float = 0.0
    total_trades: int = 0
    balance: float = 10_000.0
    eth_btc_correlation: float = 0.0
    system: SystemStatus = field(default_factory=SystemStatus)
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        """Recursively convert to dict for JSON serialization."""
        import dataclasses

        def _convert(obj: Any) -> Any:
            if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
                return {k: _convert(v) for k, v in dataclasses.asdict(obj).items()}
            if isinstance(obj, list):
                return [_convert(i) for i in obj]
            if isinstance(obj, dict):
                return {k: _convert(v) for k, v in obj.items()}
            if isinstance(obj, Enum):
                return obj.value
            return obj

        return _convert(self)
