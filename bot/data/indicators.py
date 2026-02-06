"""Computes technical indicators from the PriceAggregator."""

from __future__ import annotations

from bot.models import Asset, PriceChange, Indicator
from bot.data.price_feed import PriceAggregator


class IndicatorEngine:
    """Reads from PriceAggregator and produces indicator snapshots."""

    def __init__(self, aggregator: PriceAggregator) -> None:
        self._agg = aggregator

    def price_change(self, asset: Asset) -> PriceChange:
        return PriceChange(
            asset=asset,
            pct_5s=self._agg.pct_change(asset, 5),
            pct_15s=self._agg.pct_change(asset, 15),
            pct_30s=self._agg.pct_change(asset, 30),
            pct_1m=self._agg.pct_change(asset, 60),
            pct_5m=self._agg.pct_change(asset, 300),
            velocity=self._agg.compute_velocity(asset),
            acceleration=self._agg.compute_acceleration(asset),
        )

    def snapshot(self, asset: Asset) -> Indicator:
        return Indicator(
            asset=asset,
            sma_5m=self._agg.sma(asset, 300),
            sma_15m=self._agg.sma(asset, 900),
            sma_1h=self._agg.sma(asset, 3600),
            rsi_14=self._agg.rsi(asset),
            volatility_5m=self._agg.volatility(asset, 300),
            volatility_15m=self._agg.volatility(asset, 900),
            momentum=self._agg.pct_change(asset, 300),
        )

    def metric_value(self, asset: Asset, metric: str) -> float:
        """Resolve a metric name to its current numeric value.

        Used by the strategy engine to evaluate rule conditions.
        """
        mapping = {
            "price_change_5s": lambda: self._agg.pct_change(asset, 5),
            "price_change_15s": lambda: self._agg.pct_change(asset, 15),
            "price_change_30s": lambda: self._agg.pct_change(asset, 30),
            "price_change_1m": lambda: self._agg.pct_change(asset, 60),
            "price_change_5m": lambda: self._agg.pct_change(asset, 300),
            "velocity": lambda: self._agg.compute_velocity(asset),
            "acceleration": lambda: self._agg.compute_acceleration(asset),
            "volatility_5m": lambda: self._agg.volatility(asset, 300),
            "volatility_15m": lambda: self._agg.volatility(asset, 900),
            "sma_5m": lambda: self._agg.sma(asset, 300),
            "sma_15m": lambda: self._agg.sma(asset, 900),
            "sma_1h": lambda: self._agg.sma(asset, 3600),
            "rsi": lambda: self._agg.rsi(asset),
            "spread": lambda: self._agg.spread(asset),
            "vwap": lambda: self._agg.vwap(asset),
        }
        fn = mapping.get(metric)
        if fn is None:
            return 0.0
        return fn()
