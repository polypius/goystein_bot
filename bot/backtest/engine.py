"""Backtesting engine: replay historical price data through a strategy."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import structlog

from bot.models import (
    Asset, Side, PositionStatus, PolymarketMarket,
    StrategyConfig, RuleConfig, ConditionConfig, Signal, SignalDirection,
)

logger = structlog.get_logger()


@dataclass
class BacktestTrade:
    entry_time: float
    exit_time: float
    asset: Asset
    side: Side
    entry_price: float
    exit_price: float
    size: float
    pnl: float
    rule_name: str


@dataclass
class BacktestResult:
    strategy_name: str = ""
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    total_pnl: float = 0.0
    profit_factor: float = 0.0
    sharpe_ratio: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_pct: float = 0.0
    avg_trade_pnl: float = 0.0
    best_trade: float = 0.0
    worst_trade: float = 0.0
    trades: list[BacktestTrade] = field(default_factory=list)
    equity_curve: list[tuple[float, float]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "strategy_name": self.strategy_name,
            "total_trades": self.total_trades,
            "winning_trades": self.winning_trades,
            "losing_trades": self.losing_trades,
            "win_rate": round(self.win_rate, 2),
            "total_pnl": round(self.total_pnl, 2),
            "profit_factor": round(self.profit_factor, 2),
            "sharpe_ratio": round(self.sharpe_ratio, 2),
            "max_drawdown": round(self.max_drawdown, 2),
            "max_drawdown_pct": round(self.max_drawdown_pct, 2),
            "avg_trade_pnl": round(self.avg_trade_pnl, 2),
            "best_trade": round(self.best_trade, 2),
            "worst_trade": round(self.worst_trade, 2),
            "equity_curve": self.equity_curve,
            "trades": [
                {
                    "entry_time": t.entry_time,
                    "exit_time": t.exit_time,
                    "asset": t.asset.value,
                    "side": t.side.value,
                    "entry_price": t.entry_price,
                    "exit_price": t.exit_price,
                    "size": t.size,
                    "pnl": round(t.pnl, 2),
                    "rule_name": t.rule_name,
                }
                for t in self.trades
            ],
        }


@dataclass
class PriceBar:
    """Single price bar for backtesting."""
    timestamp: float
    open: float
    high: float
    low: float
    close: float
    volume: float


class BacktestEngine:
    """Run a strategy against historical price data."""

    def __init__(self, initial_balance: float = 10_000.0) -> None:
        self.initial_balance = initial_balance

    def run(
        self,
        config: StrategyConfig,
        price_data: dict[Asset, list[PriceBar]],
        market_interval_min: float = 15.0,
    ) -> BacktestResult:
        """Execute a full backtest.

        price_data: mapping of Asset -> list of PriceBars sorted by time.
        market_interval_min: simulated market duration.
        """
        result = BacktestResult(strategy_name=config.name)
        balance = self.initial_balance
        peak = balance
        equity: list[tuple[float, float]] = []

        for asset, bars in price_data.items():
            if len(bars) < 2:
                continue

            # Slide through bars simulating 15-minute windows
            window_bars = int(market_interval_min)  # ~1 bar per minute
            i = window_bars
            while i < len(bars):
                window = bars[i - window_bars: i]
                current_bar = bars[i]

                # Build simulated metrics
                ctx = self._build_bar_context(window, current_bar, market_interval_min)

                # Evaluate rules
                for rule in config.rules:
                    if not rule.enabled:
                        continue
                    if rule.confidence < config.confidence_threshold:
                        continue

                    passed = self._evaluate_rule_conditions(rule, ctx)
                    if not passed:
                        continue

                    edge = ctx.get("divergence", 0.0)
                    if abs(edge) < config.min_edge:
                        continue

                    # Simulate trade
                    side = Side.YES if rule.action_side == "YES" else Side.NO
                    entry_price = 0.5  # simulated Polymarket price
                    size = min(config.fixed_amount, balance)
                    if size <= 0:
                        continue

                    # Simulate exit at end of window
                    price_change = (bars[min(i + window_bars, len(bars) - 1)].close - current_bar.close) / current_bar.close
                    if side == Side.YES:
                        exit_price = min(0.95, max(0.05, entry_price + price_change))
                    else:
                        exit_price = min(0.95, max(0.05, entry_price - price_change))

                    quantity = size / entry_price
                    pnl = (exit_price - entry_price) * quantity

                    # Apply stop loss / profit target
                    pnl_pct = (pnl / size) * 100
                    if config.stop_loss_pct > 0 and pnl_pct < -config.stop_loss_pct:
                        pnl = -size * (config.stop_loss_pct / 100)
                    if config.profit_target_pct > 0 and pnl_pct > config.profit_target_pct:
                        pnl = size * (config.profit_target_pct / 100)

                    balance += pnl
                    peak = max(peak, balance)
                    dd = peak - balance
                    if dd > result.max_drawdown:
                        result.max_drawdown = dd
                        result.max_drawdown_pct = (dd / peak * 100) if peak > 0 else 0

                    trade = BacktestTrade(
                        entry_time=current_bar.timestamp,
                        exit_time=bars[min(i + window_bars, len(bars) - 1)].timestamp,
                        asset=asset,
                        side=side,
                        entry_price=entry_price,
                        exit_price=exit_price,
                        size=size,
                        pnl=pnl,
                        rule_name=rule.name,
                    )
                    result.trades.append(trade)
                    equity.append((current_bar.timestamp, balance))
                    break  # one trade per window

                i += window_bars

        # Compute summary stats
        result.equity_curve = equity
        result.total_trades = len(result.trades)
        result.winning_trades = sum(1 for t in result.trades if t.pnl > 0)
        result.losing_trades = sum(1 for t in result.trades if t.pnl <= 0)
        result.win_rate = (
            (result.winning_trades / result.total_trades * 100) if result.total_trades else 0
        )
        result.total_pnl = balance - self.initial_balance

        gross_profit = sum(t.pnl for t in result.trades if t.pnl > 0)
        gross_loss = abs(sum(t.pnl for t in result.trades if t.pnl < 0))
        result.profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else float("inf")

        if result.trades:
            pnls = [t.pnl for t in result.trades]
            result.avg_trade_pnl = sum(pnls) / len(pnls)
            result.best_trade = max(pnls)
            result.worst_trade = min(pnls)
            mean_pnl = result.avg_trade_pnl
            if len(pnls) > 1:
                variance = sum((p - mean_pnl) ** 2 for p in pnls) / (len(pnls) - 1)
                std = variance ** 0.5
                result.sharpe_ratio = (mean_pnl / std) if std > 0 else 0
            else:
                result.sharpe_ratio = 0

        return result

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_bar_context(
        window: list[PriceBar], current: PriceBar, window_min: float
    ) -> dict[str, float]:
        closes = [b.close for b in window]
        if not closes:
            return {}
        first = closes[0]
        last = closes[-1]
        mean = sum(closes) / len(closes)
        variance = sum((c - mean) ** 2 for c in closes) / max(len(closes), 1)

        pct_change = ((last - first) / first * 100) if first else 0
        ctx = {
            "price_change_5s": pct_change / 10,
            "price_change_15s": pct_change / 5,
            "price_change_30s": pct_change / 3,
            "price_change_1m": pct_change / 2,
            "price_change_5m": pct_change,
            "velocity": (last - first) / max(len(closes), 1),
            "acceleration": 0.0,
            "volatility_5m": variance ** 0.5,
            "volatility_15m": variance ** 0.5,
            "sma_5m": mean,
            "sma_15m": mean,
            "sma_1h": mean,
            "rsi": 50.0,
            "spread": current.high - current.low,
            "vwap": mean,
            "polymarket_yes_price": 0.5,
            "polymarket_no_price": 0.5,
            "polymarket_odds_change": 0.0,
            "time_remaining": window_min / 2,
            "divergence": pct_change * 0.5,
            "implied_prob": 0.5,
            "exchange_price": last,
            "strike_price": last,
        }
        # Rough RSI
        gains, losses = [], []
        for i in range(1, len(closes)):
            d = closes[i] - closes[i - 1]
            gains.append(max(d, 0))
            losses.append(max(-d, 0))
        if gains and losses:
            avg_g = sum(gains) / len(gains)
            avg_l = sum(losses) / len(losses) or 1
            ctx["rsi"] = 100 - 100 / (1 + avg_g / avg_l)
        return ctx

    @staticmethod
    def _evaluate_rule_conditions(rule: RuleConfig, ctx: dict[str, float]) -> bool:
        results = []
        for c in rule.conditions:
            val = ctx.get(c.metric, 0.0)
            op = c.operator
            if op == "gt":
                results.append(val > c.value)
            elif op == "lt":
                results.append(val < c.value)
            elif op == "gte":
                results.append(val >= c.value)
            elif op == "lte":
                results.append(val <= c.value)
            elif op == "eq":
                results.append(abs(val - c.value) < 1e-9)
            elif op == "between":
                results.append(c.value <= val <= c.value2)
            elif op == "abs_gt":
                results.append(abs(val) > c.value)
            elif op == "abs_lt":
                results.append(abs(val) < c.value)
            else:
                results.append(False)

        if not results:
            return False
        if rule.logic == "AND":
            return all(results)
        return any(results)
