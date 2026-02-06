"""Strategy engine: evaluates rules against market data to produce trading signals."""

from __future__ import annotations

import time
import uuid
from typing import Any

import structlog

from bot.models import (
    Asset, Side, Signal, SignalDirection,
    StrategyConfig, RuleConfig, ConditionConfig,
    PolymarketMarket,
)
from bot.data.indicators import IndicatorEngine
from bot.data.price_feed import PriceAggregator
from bot.polymarket.client import PolymarketClient

logger = structlog.get_logger()

# Metrics that come from Polymarket rather than exchange data
POLYMARKET_METRICS = {
    "polymarket_odds_change",
    "polymarket_yes_price",
    "polymarket_no_price",
    "time_remaining",
    "divergence",
    "implied_prob",
}


class StrategyEngine:
    """Evaluate strategy rules against live data and generate signals."""

    def __init__(
        self,
        config: StrategyConfig,
        aggregator: PriceAggregator,
        indicators: IndicatorEngine,
        polymarket: PolymarketClient,
    ) -> None:
        self.config = config
        self._agg = aggregator
        self._ind = indicators
        self._poly = polymarket
        self._prev_odds: dict[str, float] = {}  # condition_id -> previous yes_price

    def update_config(self, config: StrategyConfig) -> None:
        self.config = config

    # ------------------------------------------------------------------
    # Main evaluation loop
    # ------------------------------------------------------------------

    def evaluate(self) -> list[Signal]:
        """Run all enabled rules against all active markets. Returns signals."""
        signals: list[Signal] = []
        for asset in (Asset.ETH, Asset.BTC):
            markets = self._poly.active_markets(asset)
            for market in markets:
                if market.condition_id in self.config.blacklisted_markets:
                    continue
                if market.time_remaining_min < self.config.min_time_remaining:
                    continue
                for rule in self.config.rules:
                    if not rule.enabled:
                        continue
                    sig = self._evaluate_rule(rule, asset, market)
                    if sig:
                        signals.append(sig)
        return signals

    # ------------------------------------------------------------------
    # Rule evaluation
    # ------------------------------------------------------------------

    def _evaluate_rule(
        self, rule: RuleConfig, asset: Asset, market: PolymarketMarket
    ) -> Signal | None:
        ctx = self._build_context(asset, market)
        results = [self._eval_condition(c, ctx) for c in rule.conditions]

        if not results:
            return None

        if rule.logic == "AND":
            passed = all(results)
        else:
            passed = any(results)

        if not passed:
            return None

        # Check minimum edge
        edge = ctx.get("divergence", 0.0)
        if abs(edge) < self.config.min_edge:
            return None

        # Check confidence threshold
        if rule.confidence < self.config.confidence_threshold:
            return None

        # Determine direction and side
        if rule.action_side == "YES":
            side = Side.YES
            direction = SignalDirection.UP
        else:
            side = Side.NO
            direction = SignalDirection.DOWN

        explanation = self._build_explanation(rule, ctx, market)

        return Signal(
            id=str(uuid.uuid4())[:8],
            asset=asset,
            direction=direction,
            side=side,
            market=market,
            confidence=float(rule.confidence),
            edge=edge,
            rule_name=rule.name,
            explanation=explanation,
            indicators=ctx,
        )

    def _build_context(self, asset: Asset, market: PolymarketMarket) -> dict[str, float]:
        """Build a dictionary of all available metrics for condition evaluation."""
        exchange_price = self._agg.vwap(asset)
        ctx: dict[str, float] = {}

        # Exchange-based metrics
        for metric in [
            "price_change_5s", "price_change_15s", "price_change_30s",
            "price_change_1m", "price_change_5m",
            "velocity", "acceleration",
            "volatility_5m", "volatility_15m",
            "sma_5m", "sma_15m", "sma_1h",
            "rsi", "spread", "vwap",
        ]:
            ctx[metric] = self._ind.metric_value(asset, metric)

        # Polymarket metrics
        ctx["polymarket_yes_price"] = market.yes_price
        ctx["polymarket_no_price"] = market.no_price
        ctx["time_remaining"] = market.time_remaining_min
        ctx["implied_prob"] = market.implied_prob_up

        prev_odds = self._prev_odds.get(market.condition_id, market.yes_price)
        ctx["polymarket_odds_change"] = (market.yes_price - prev_odds) * 100
        self._prev_odds[market.condition_id] = market.yes_price

        ctx["divergence"] = self._poly.divergence(market, exchange_price)
        ctx["exchange_price"] = exchange_price
        ctx["strike_price"] = market.strike_price

        return ctx

    @staticmethod
    def _eval_condition(cond: ConditionConfig, ctx: dict[str, float]) -> bool:
        val = ctx.get(cond.metric, 0.0)
        op = cond.operator
        if op == "gt":
            return val > cond.value
        if op == "lt":
            return val < cond.value
        if op == "gte":
            return val >= cond.value
        if op == "lte":
            return val <= cond.value
        if op == "eq":
            return abs(val - cond.value) < 1e-9
        if op == "between":
            return cond.value <= val <= cond.value2
        if op == "abs_gt":
            return abs(val) > cond.value
        if op == "abs_lt":
            return abs(val) < cond.value
        return False

    @staticmethod
    def _build_explanation(
        rule: RuleConfig, ctx: dict[str, float], market: PolymarketMarket
    ) -> str:
        parts = [f"Rule '{rule.name}' triggered:"]
        for c in rule.conditions:
            val = ctx.get(c.metric, 0.0)
            parts.append(f"  {c.metric} = {val:.4f} {c.operator} {c.value}")
        parts.append(f"  Market: {market.question}")
        parts.append(f"  Edge: {ctx.get('divergence', 0):.2f}%")
        parts.append(f"  Time left: {market.time_remaining_min:.1f} min")
        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Available metrics (for the UI rule builder)
    # ------------------------------------------------------------------

    @staticmethod
    def available_metrics() -> list[dict[str, str]]:
        return [
            {"key": "price_change_5s", "label": "Price change (5s)", "unit": "%"},
            {"key": "price_change_15s", "label": "Price change (15s)", "unit": "%"},
            {"key": "price_change_30s", "label": "Price change (30s)", "unit": "%"},
            {"key": "price_change_1m", "label": "Price change (1m)", "unit": "%"},
            {"key": "price_change_5m", "label": "Price change (5m)", "unit": "%"},
            {"key": "velocity", "label": "Price velocity", "unit": "$/s"},
            {"key": "acceleration", "label": "Price acceleration", "unit": "$/s²"},
            {"key": "volatility_5m", "label": "Volatility (5m)", "unit": "$"},
            {"key": "volatility_15m", "label": "Volatility (15m)", "unit": "$"},
            {"key": "sma_5m", "label": "SMA (5m)", "unit": "$"},
            {"key": "sma_15m", "label": "SMA (15m)", "unit": "$"},
            {"key": "sma_1h", "label": "SMA (1h)", "unit": "$"},
            {"key": "rsi", "label": "RSI (14)", "unit": ""},
            {"key": "spread", "label": "Bid-Ask spread", "unit": "$"},
            {"key": "polymarket_yes_price", "label": "PM YES price", "unit": ""},
            {"key": "polymarket_no_price", "label": "PM NO price", "unit": ""},
            {"key": "polymarket_odds_change", "label": "PM odds change", "unit": "%"},
            {"key": "time_remaining", "label": "Time remaining", "unit": "min"},
            {"key": "divergence", "label": "Price-odds divergence", "unit": "%"},
            {"key": "implied_prob", "label": "Implied probability", "unit": ""},
        ]

    @staticmethod
    def available_operators() -> list[dict[str, str]]:
        return [
            {"key": "gt", "label": "greater than"},
            {"key": "lt", "label": "less than"},
            {"key": "gte", "label": "greater or equal"},
            {"key": "lte", "label": "less or equal"},
            {"key": "eq", "label": "equals"},
            {"key": "between", "label": "between"},
            {"key": "abs_gt", "label": "absolute value greater than"},
            {"key": "abs_lt", "label": "absolute value less than"},
        ]
