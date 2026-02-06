"""Real-time price feeds from multiple exchanges via WebSocket."""

from __future__ import annotations

import asyncio
import json
import time
from collections import deque
from typing import Callable

import structlog
import websockets
from websockets.exceptions import ConnectionClosed

from bot.models import Asset, PriceTick, ConnectionHealth

logger = structlog.get_logger()

# Maximum history kept per asset (seconds of 100ms ticks ~ 60 min)
MAX_HISTORY = 36_000


class ExchangeFeed:
    """Base class for a single exchange WebSocket feed."""

    name: str = "unknown"
    ws_url: str = ""

    def __init__(self) -> None:
        self.health = ConnectionHealth(source=self.name)
        self._ws: websockets.WebSocketClientProtocol | None = None
        self._running = False
        self._callbacks: list[Callable] = []

    def on_tick(self, cb: Callable[[PriceTick], None]) -> None:
        self._callbacks.append(cb)

    def _emit(self, tick: PriceTick) -> None:
        for cb in self._callbacks:
            try:
                cb(tick)
            except Exception:
                logger.exception("tick_callback_error", exchange=self.name)

    async def connect(self) -> None:
        self._running = True
        while self._running:
            try:
                async with websockets.connect(self.ws_url, ping_interval=20) as ws:
                    self._ws = ws
                    self.health.connected = True
                    self.health.status = "connected"
                    self.health.error_count = 0
                    logger.info("exchange_connected", exchange=self.name)
                    await self._subscribe(ws)
                    async for raw in ws:
                        t0 = time.time()
                        tick = self._parse(raw)
                        if tick:
                            self.health.latency_ms = (time.time() - t0) * 1000
                            self.health.last_message = time.time()
                            self._emit(tick)
            except (ConnectionClosed, OSError, asyncio.CancelledError) as exc:
                self.health.connected = False
                self.health.status = "disconnected"
                self.health.error_count += 1
                logger.warning("exchange_disconnected", exchange=self.name, err=str(exc))
                if self._running:
                    await asyncio.sleep(min(2 ** self.health.error_count, 30))

    async def _subscribe(self, ws: websockets.WebSocketClientProtocol) -> None:
        raise NotImplementedError

    def _parse(self, raw: str | bytes) -> PriceTick | None:
        raise NotImplementedError

    async def stop(self) -> None:
        self._running = False
        if self._ws:
            await self._ws.close()


# ---------------------------------------------------------------------------
# Binance
# ---------------------------------------------------------------------------
class BinanceFeed(ExchangeFeed):
    name = "binance"
    ws_url = "wss://stream.binance.com:9443/ws"

    SYMBOLS = {"ethusdt": Asset.ETH, "btcusdt": Asset.BTC}

    async def _subscribe(self, ws: websockets.WebSocketClientProtocol) -> None:
        msg = {
            "method": "SUBSCRIBE",
            "params": [f"{s}@ticker" for s in self.SYMBOLS],
            "id": 1,
        }
        await ws.send(json.dumps(msg))

    def _parse(self, raw: str | bytes) -> PriceTick | None:
        data = json.loads(raw)
        symbol = data.get("s", "").lower()
        asset = self.SYMBOLS.get(symbol)
        if asset is None:
            return None
        return PriceTick(
            exchange=self.name,
            asset=asset,
            price=float(data["c"]),
            volume_24h=float(data.get("v", 0)),
            bid=float(data.get("b", data["c"])),
            ask=float(data.get("a", data["c"])),
        )


# ---------------------------------------------------------------------------
# Coinbase
# ---------------------------------------------------------------------------
class CoinbaseFeed(ExchangeFeed):
    name = "coinbase"
    ws_url = "wss://ws-feed.exchange.coinbase.com"

    PRODUCTS = {"ETH-USD": Asset.ETH, "BTC-USD": Asset.BTC}

    async def _subscribe(self, ws: websockets.WebSocketClientProtocol) -> None:
        msg = {
            "type": "subscribe",
            "channels": [{"name": "ticker", "product_ids": list(self.PRODUCTS)}],
        }
        await ws.send(json.dumps(msg))

    def _parse(self, raw: str | bytes) -> PriceTick | None:
        data = json.loads(raw)
        if data.get("type") != "ticker":
            return None
        asset = self.PRODUCTS.get(data.get("product_id", ""))
        if asset is None:
            return None
        price = float(data["price"])
        return PriceTick(
            exchange=self.name,
            asset=asset,
            price=price,
            volume_24h=float(data.get("volume_24h", 0)),
            bid=float(data.get("best_bid", price)),
            ask=float(data.get("best_ask", price)),
        )


# ---------------------------------------------------------------------------
# Kraken
# ---------------------------------------------------------------------------
class KrakenFeed(ExchangeFeed):
    name = "kraken"
    ws_url = "wss://ws.kraken.com"

    PAIRS = {"ETH/USD": Asset.ETH, "XBT/USD": Asset.BTC}

    async def _subscribe(self, ws: websockets.WebSocketClientProtocol) -> None:
        msg = {
            "event": "subscribe",
            "pair": list(self.PAIRS),
            "subscription": {"name": "ticker"},
        }
        await ws.send(json.dumps(msg))

    def _parse(self, raw: str | bytes) -> PriceTick | None:
        data = json.loads(raw)
        if not isinstance(data, list) or len(data) < 4:
            return None
        pair = data[-1]
        asset = self.PAIRS.get(pair)
        if asset is None:
            return None
        info = data[1]
        price = float(info["c"][0])
        return PriceTick(
            exchange=self.name,
            asset=asset,
            price=price,
            volume_24h=float(info.get("v", [0, 0])[1]),
            bid=float(info["b"][0]),
            ask=float(info["a"][0]),
        )


# ---------------------------------------------------------------------------
# Price Aggregator
# ---------------------------------------------------------------------------
class PriceAggregator:
    """Maintains a real-time volume-weighted average price across exchanges."""

    def __init__(self) -> None:
        # Latest tick per exchange per asset
        self._latest: dict[Asset, dict[str, PriceTick]] = {
            Asset.ETH: {},
            Asset.BTC: {},
        }
        # History: asset -> deque of (timestamp, price)
        self._history: dict[Asset, deque[tuple[float, float]]] = {
            Asset.ETH: deque(maxlen=MAX_HISTORY),
            Asset.BTC: deque(maxlen=MAX_HISTORY),
        }
        self._velocity: dict[Asset, float] = {Asset.ETH: 0.0, Asset.BTC: 0.0}
        self._prev_velocity: dict[Asset, float] = {Asset.ETH: 0.0, Asset.BTC: 0.0}

    def ingest(self, tick: PriceTick) -> None:
        self._latest[tick.asset][tick.exchange] = tick
        vwap = self.vwap(tick.asset)
        self._history[tick.asset].append((tick.timestamp, vwap))

    def vwap(self, asset: Asset) -> float:
        ticks = self._latest[asset]
        if not ticks:
            return 0.0
        total_vol = sum(t.volume_24h for t in ticks.values()) or 1.0
        return sum(t.price * t.volume_24h for t in ticks.values()) / total_vol

    def spread(self, asset: Asset) -> float:
        ticks = self._latest[asset]
        if not ticks:
            return 0.0
        bids = [t.bid for t in ticks.values() if t.bid > 0]
        asks = [t.ask for t in ticks.values() if t.ask > 0]
        if not bids or not asks:
            return 0.0
        return min(asks) - max(bids)

    def price_at(self, asset: Asset, seconds_ago: float) -> float | None:
        cutoff = time.time() - seconds_ago
        hist = self._history[asset]
        for ts, price in reversed(hist):
            if ts <= cutoff:
                return price
        return hist[0][1] if hist else None

    def pct_change(self, asset: Asset, seconds: float) -> float:
        current = self.vwap(asset)
        past = self.price_at(asset, seconds)
        if not past or past == 0:
            return 0.0
        return ((current - past) / past) * 100.0

    def compute_velocity(self, asset: Asset) -> float:
        """Price change per second over the last 5 seconds."""
        h = self._history[asset]
        if len(h) < 2:
            return 0.0
        cutoff = time.time() - 5.0
        recent = [(ts, p) for ts, p in h if ts >= cutoff]
        if len(recent) < 2:
            return 0.0
        dt = recent[-1][0] - recent[0][0]
        if dt == 0:
            return 0.0
        vel = (recent[-1][1] - recent[0][1]) / dt
        self._prev_velocity[asset] = self._velocity[asset]
        self._velocity[asset] = vel
        return vel

    def compute_acceleration(self, asset: Asset) -> float:
        return self._velocity[asset] - self._prev_velocity[asset]

    def volatility(self, asset: Asset, seconds: float) -> float:
        """Standard deviation of price over the last N seconds."""
        cutoff = time.time() - seconds
        prices = [p for ts, p in self._history[asset] if ts >= cutoff]
        if len(prices) < 2:
            return 0.0
        mean = sum(prices) / len(prices)
        variance = sum((p - mean) ** 2 for p in prices) / len(prices)
        return variance ** 0.5

    def sma(self, asset: Asset, seconds: float) -> float:
        cutoff = time.time() - seconds
        prices = [p for ts, p in self._history[asset] if ts >= cutoff]
        return sum(prices) / len(prices) if prices else 0.0

    def rsi(self, asset: Asset, periods: int = 14, interval_s: float = 60) -> float:
        """RSI using closing prices at fixed intervals."""
        h = list(self._history[asset])
        if len(h) < periods + 1:
            return 50.0
        # Sample at intervals
        now = time.time()
        closes: list[float] = []
        for i in range(periods + 1):
            target = now - (periods - i) * interval_s
            best = min(h, key=lambda x: abs(x[0] - target))
            closes.append(best[1])
        gains, losses = [], []
        for i in range(1, len(closes)):
            diff = closes[i] - closes[i - 1]
            gains.append(max(diff, 0))
            losses.append(max(-diff, 0))
        avg_gain = sum(gains) / len(gains) if gains else 0
        avg_loss = sum(losses) / len(losses) if losses else 0
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return 100.0 - (100.0 / (1.0 + rs))

    def get_exchange_prices(self, asset: Asset) -> dict[str, float]:
        return {ex: t.price for ex, t in self._latest[asset].items()}

    def get_exchange_volumes(self, asset: Asset) -> dict[str, float]:
        return {ex: t.volume_24h for ex, t in self._latest[asset].items()}

    def get_healths(self) -> dict[str, ConnectionHealth]:
        healths: dict[str, ConnectionHealth] = {}
        for asset_ticks in self._latest.values():
            for ex, tick in asset_ticks.items():
                age = time.time() - tick.timestamp
                healths[ex] = ConnectionHealth(
                    source=ex,
                    connected=age < 30,
                    latency_ms=0,
                    last_message=tick.timestamp,
                    status="connected" if age < 30 else "degraded",
                )
        return healths
