"""Polymarket API client for monitoring 15-minute binary outcome markets."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx
import structlog

from bot.models import Asset, PolymarketMarket, ConnectionHealth

logger = structlog.get_logger()

# Polymarket CLOB API base URLs
CLOB_BASE = "https://clob.polymarket.com"
GAMMA_BASE = "https://gamma-api.polymarket.com"

# Keywords used to identify 15-minute ETH/BTC markets
ASSET_KEYWORDS: dict[str, Asset] = {
    "ETH": Asset.ETH,
    "Ethereum": Asset.ETH,
    "BTC": Asset.BTC,
    "Bitcoin": Asset.BTC,
}


class PolymarketClient:
    """Polls the Polymarket APIs for active 15-minute crypto markets."""

    def __init__(self, api_key: str = "", api_secret: str = "", passphrase: str = "") -> None:
        self._api_key = api_key
        self._api_secret = api_secret
        self._passphrase = passphrase
        self._http = httpx.AsyncClient(timeout=10)
        self.health = ConnectionHealth(source="polymarket")
        self.markets: dict[str, PolymarketMarket] = {}
        self._running = False

    # ------------------------------------------------------------------
    # Market discovery
    # ------------------------------------------------------------------

    async def fetch_markets(self) -> list[PolymarketMarket]:
        """Fetch active 15-minute crypto markets from the Gamma API."""
        markets: list[PolymarketMarket] = []
        try:
            resp = await self._http.get(
                f"{GAMMA_BASE}/markets",
                params={"active": "true", "closed": "false", "limit": 100},
            )
            resp.raise_for_status()
            data = resp.json()
            for item in data:
                market = self._parse_market(item)
                if market:
                    markets.append(market)
            self.health.connected = True
            self.health.status = "connected"
            self.health.last_message = time.time()
        except Exception as exc:
            self.health.connected = False
            self.health.status = "disconnected"
            self.health.error_count += 1
            logger.warning("polymarket_fetch_error", err=str(exc))
        return markets

    async def fetch_orderbook(self, token_id: str) -> dict[str, Any]:
        """Fetch the order book for a specific token."""
        try:
            resp = await self._http.get(
                f"{CLOB_BASE}/book", params={"token_id": token_id}
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            logger.warning("orderbook_fetch_error", token_id=token_id, err=str(exc))
            return {}

    async def fetch_price(self, token_id: str) -> float:
        """Fetch the current mid-price for a token."""
        try:
            resp = await self._http.get(
                f"{CLOB_BASE}/price", params={"token_id": token_id, "side": "buy"}
            )
            resp.raise_for_status()
            return float(resp.json().get("price", 0))
        except Exception:
            return 0.0

    # ------------------------------------------------------------------
    # Continuous polling loop
    # ------------------------------------------------------------------

    async def start_polling(self, interval: float = 5.0) -> None:
        """Continuously poll for markets and prices."""
        self._running = True
        while self._running:
            try:
                new_markets = await self.fetch_markets()
                for m in new_markets:
                    self.markets[m.condition_id] = m
                # Update prices for known markets
                for mid, market in list(self.markets.items()):
                    if market.time_remaining_s <= 0:
                        market.active = False
                        continue
                    if market.yes_token_id:
                        price = await self.fetch_price(market.yes_token_id)
                        if price > 0:
                            market.yes_price = price
                            market.no_price = 1.0 - price
                self.health.last_message = time.time()
            except Exception as exc:
                logger.warning("poll_error", err=str(exc))
                self.health.error_count += 1
            await asyncio.sleep(interval)

    async def stop(self) -> None:
        self._running = False
        await self._http.aclose()

    # ------------------------------------------------------------------
    # Active market helpers
    # ------------------------------------------------------------------

    def active_markets(self, asset: Asset | None = None) -> list[PolymarketMarket]:
        now = time.time()
        result = []
        for m in self.markets.values():
            if not m.active or m.end_time <= now:
                continue
            if asset and m.asset != asset:
                continue
            result.append(m)
        return sorted(result, key=lambda m: m.end_time)

    def implied_price(self, market: PolymarketMarket) -> float:
        """Convert Polymarket odds to implied price target.

        For a market "ETH above $X?", yes_price is probability of being above.
        """
        return market.strike_price

    def divergence(self, market: PolymarketMarket, exchange_price: float) -> float:
        """Calculate divergence between exchange price and Polymarket implied probability.

        Returns estimated edge in percentage points.
        If exchange price > strike and YES is cheap, that's positive edge on YES.
        """
        if exchange_price == 0 or market.strike_price == 0:
            return 0.0
        # Estimate a "true" probability based on current price distance from strike
        distance_pct = ((exchange_price - market.strike_price) / market.strike_price) * 100
        # Simple mapping: larger distance = higher probability
        # This is a rough estimate; real implementation would use vol-adjusted model
        if distance_pct > 0:
            estimated_prob = min(0.95, 0.5 + distance_pct * 0.1)
        else:
            estimated_prob = max(0.05, 0.5 + distance_pct * 0.1)
        return (estimated_prob - market.yes_price) * 100

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _parse_market(self, item: dict[str, Any]) -> PolymarketMarket | None:
        """Parse a market item from the Gamma API response."""
        question = item.get("question", "")
        # Identify asset
        asset = None
        for keyword, a in ASSET_KEYWORDS.items():
            if keyword.lower() in question.lower():
                asset = a
                break
        if asset is None:
            return None

        # Check for 15-minute market pattern
        end_date = item.get("end_date_iso", "")
        # Try to extract strike price from question (e.g. "ETH above $2500?")
        strike = self._extract_strike(question)
        if strike is None:
            return None

        tokens = item.get("tokens", [])
        yes_token = ""
        no_token = ""
        yes_price = 0.5
        no_price = 0.5
        for tok in tokens:
            if tok.get("outcome", "").upper() == "YES":
                yes_token = tok.get("token_id", "")
                yes_price = float(tok.get("price", 0.5))
            elif tok.get("outcome", "").upper() == "NO":
                no_token = tok.get("token_id", "")
                no_price = float(tok.get("price", 0.5))

        import datetime

        try:
            end_time = datetime.datetime.fromisoformat(
                end_date.replace("Z", "+00:00")
            ).timestamp()
        except (ValueError, AttributeError):
            end_time = time.time() + 900  # default 15 min

        return PolymarketMarket(
            condition_id=item.get("condition_id", item.get("id", "")),
            question=question,
            asset=asset,
            strike_price=strike,
            end_time=end_time,
            yes_price=yes_price,
            no_price=no_price,
            yes_token_id=yes_token,
            no_token_id=no_token,
            volume=float(item.get("volume", 0)),
            liquidity=float(item.get("liquidity", 0)),
        )

    @staticmethod
    def _extract_strike(question: str) -> float | None:
        """Extract a dollar strike price from market question text."""
        import re

        # Match patterns like "$2,500", "$2500.50", "$95,000"
        match = re.search(r"\$([0-9,]+(?:\.[0-9]+)?)", question)
        if match:
            return float(match.group(1).replace(",", ""))
        return None
