"""Computes technical indicators from the PriceAggregator."""

from __future__ import annotations

import math

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

    def correlation(self, seconds: float = 300) -> float:
        """Pearson correlation between ETH and BTC returns over the given window."""
        import time as _time
        cutoff = _time.time() - seconds
        eth_hist = [(ts, p) for ts, p in self._agg._history[Asset.ETH] if ts >= cutoff]
        btc_hist = [(ts, p) for ts, p in self._agg._history[Asset.BTC] if ts >= cutoff]

        if len(eth_hist) < 10 or len(btc_hist) < 10:
            return 0.0

        # Compute returns at ~1s intervals by aligning timestamps
        def _returns(hist: list[tuple[float, float]]) -> list[float]:
            rets = []
            for i in range(1, len(hist)):
                prev = hist[i - 1][1]
                if prev != 0:
                    rets.append((hist[i][1] - prev) / prev)
            return rets

        eth_ret = _returns(eth_hist)
        btc_ret = _returns(btc_hist)

        # Truncate to same length
        n = min(len(eth_ret), len(btc_ret))
        if n < 5:
            return 0.0
        eth_ret = eth_ret[-n:]
        btc_ret = btc_ret[-n:]

        # Pearson correlation
        mean_e = sum(eth_ret) / n
        mean_b = sum(btc_ret) / n
        cov = sum((e - mean_e) * (b - mean_b) for e, b in zip(eth_ret, btc_ret)) / n
        std_e = math.sqrt(sum((e - mean_e) ** 2 for e in eth_ret) / n)
        std_b = math.sqrt(sum((b - mean_b) ** 2 for b in btc_ret) / n)
        if std_e == 0 or std_b == 0:
            return 0.0
        return cov / (std_e * std_b)

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
            "eth_btc_correlation": lambda: self.correlation(),
        }
        fn = mapping.get(metric)
        if fn is None:
            return 0.0
        return fn()
