"""Order execution against Polymarket CLOB."""

from __future__ import annotations

import time
import uuid

import httpx
import structlog

from bot.models import (
    Side, OrderType, Signal, Position, Trade, PositionStatus,
    PolymarketMarket,
)

logger = structlog.get_logger()

CLOB_BASE = "https://clob.polymarket.com"


class PolymarketExecutor:
    """Places orders on Polymarket (live) or simulates them (paper)."""

    def __init__(
        self,
        api_key: str = "",
        api_secret: str = "",
        passphrase: str = "",
        funder: str = "",
        live: bool = False,
    ) -> None:
        self._api_key = api_key
        self._api_secret = api_secret
        self._passphrase = passphrase
        self._funder = funder
        self._live = live
        self._http = httpx.AsyncClient(timeout=10)

    async def place_order(
        self,
        market: PolymarketMarket,
        side: Side,
        size_usdc: float,
        order_type: OrderType = OrderType.MARKET,
        limit_price: float | None = None,
    ) -> Trade | None:
        """Place an order. Returns a Trade record or None on failure."""
        token_id = market.yes_token_id if side == Side.YES else market.no_token_id
        price = market.yes_price if side == Side.YES else market.no_price

        if price <= 0 or price >= 1:
            logger.warning("invalid_price", price=price, side=side)
            return None

        quantity = size_usdc / price

        if self._live:
            return await self._place_live(market, token_id, side, price, size_usdc, quantity)
        return self._place_paper(market, side, price, size_usdc, quantity)

    def _place_paper(
        self,
        market: PolymarketMarket,
        side: Side,
        price: float,
        size: float,
        quantity: float,
    ) -> Trade:
        trade_id = str(uuid.uuid4())[:8]
        logger.info(
            "paper_order",
            market=market.question[:50],
            side=side.value,
            price=price,
            size=size,
        )
        return Trade(
            id=trade_id,
            position_id="",
            market_id=market.condition_id,
            asset=market.asset,
            side=side,
            direction="open",
            price=price,
            size=size,
            quantity=quantity,
            rule_name="",
        )

    async def _place_live(
        self,
        market: PolymarketMarket,
        token_id: str,
        side: Side,
        price: float,
        size: float,
        quantity: float,
    ) -> Trade | None:
        """Place a real order via the CLOB API."""
        try:
            # Build order payload per Polymarket CLOB spec
            order = {
                "tokenID": token_id,
                "price": str(round(price, 4)),
                "size": str(round(quantity, 2)),
                "side": "BUY",
                "feeRateBps": "0",
                "nonce": str(int(time.time() * 1000)),
                "expiration": "0",
            }
            headers = {
                "POLY-ADDRESS": self._funder,
                "POLY-API-KEY": self._api_key,
                "POLY-PASSPHRASE": self._passphrase,
            }
            resp = await self._http.post(
                f"{CLOB_BASE}/order",
                json=order,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
            trade_id = data.get("orderID", str(uuid.uuid4())[:8])
            logger.info(
                "live_order_placed",
                order_id=trade_id,
                market=market.question[:50],
                side=side.value,
                price=price,
                size=size,
            )
            return Trade(
                id=trade_id,
                position_id="",
                market_id=market.condition_id,
                asset=market.asset,
                side=side,
                direction="open",
                price=price,
                size=size,
                quantity=quantity,
            )
        except Exception as exc:
            logger.error("live_order_error", err=str(exc))
            return None

    async def close(self) -> None:
        await self._http.aclose()
