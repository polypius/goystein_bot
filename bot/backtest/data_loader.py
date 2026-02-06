"""Load historical price data for backtesting."""

from __future__ import annotations

import time

import httpx
import structlog

from bot.models import Asset
from bot.backtest.engine import PriceBar

logger = structlog.get_logger()

# Binance kline endpoint (free, no auth required)
BINANCE_KLINES = "https://api.binance.com/api/v3/klines"

ASSET_SYMBOL = {
    Asset.ETH: "ETHUSDT",
    Asset.BTC: "BTCUSDT",
}


async def fetch_historical_bars(
    asset: Asset,
    interval: str = "1m",
    limit: int = 1000,
    start_time: int | None = None,
    end_time: int | None = None,
) -> list[PriceBar]:
    """Fetch historical kline data from Binance."""
    symbol = ASSET_SYMBOL[asset]
    params: dict = {
        "symbol": symbol,
        "interval": interval,
        "limit": limit,
    }
    if start_time:
        params["startTime"] = start_time
    if end_time:
        params["endTime"] = end_time

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(BINANCE_KLINES, params=params)
        resp.raise_for_status()
        data = resp.json()

    bars: list[PriceBar] = []
    for item in data:
        bars.append(
            PriceBar(
                timestamp=item[0] / 1000,
                open=float(item[1]),
                high=float(item[2]),
                low=float(item[3]),
                close=float(item[4]),
                volume=float(item[5]),
            )
        )
    return bars


async def fetch_multi_asset_bars(
    assets: list[Asset] | None = None,
    interval: str = "1m",
    limit: int = 1000,
) -> dict[Asset, list[PriceBar]]:
    """Fetch historical bars for multiple assets."""
    if assets is None:
        assets = [Asset.ETH, Asset.BTC]
    result: dict[Asset, list[PriceBar]] = {}
    for asset in assets:
        try:
            bars = await fetch_historical_bars(asset, interval, limit)
            result[asset] = bars
            logger.info("backtest_data_loaded", asset=asset.value, bars=len(bars))
        except Exception as exc:
            logger.error("backtest_data_error", asset=asset.value, err=str(exc))
            result[asset] = []
    return result
