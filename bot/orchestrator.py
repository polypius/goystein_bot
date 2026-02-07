"""Central orchestrator: wires data feeds, strategy, execution, and risk together."""

from __future__ import annotations

import asyncio
import time

import structlog

from bot.config import settings
from bot.models import (
    Asset, Signal, DashboardState, AggregatedPrice, SystemStatus,
)
from bot.data.price_feed import (
    PriceAggregator, BinanceFeed, CoinbaseFeed, KrakenFeed, ExchangeFeed,
)
from bot.data.indicators import IndicatorEngine
from bot.polymarket.client import PolymarketClient
from bot.polymarket.executor import PolymarketExecutor
from bot.strategy.engine import StrategyEngine
from bot.strategy.templates import load_template
from bot.strategy.serializer import strategy_to_dict, strategy_from_dict
from bot.execution.manager import PositionManager
from bot.risk.manager import RiskManager
from bot.models import StrategyConfig, StrategyTemplate

logger = structlog.get_logger()

# How often the main loop evaluates signals (seconds)
EVAL_INTERVAL = 0.5


class Orchestrator:
    """Top-level coordinator that runs the trading bot."""

    def __init__(self) -> None:
        # Data layer
        self.aggregator = PriceAggregator()
        self.indicators = IndicatorEngine(self.aggregator)

        # Feeds
        self.feeds: list[ExchangeFeed] = [BinanceFeed(), CoinbaseFeed(), KrakenFeed()]
        for feed in self.feeds:
            feed.on_tick(self.aggregator.ingest)

        # Polymarket
        self.polymarket = PolymarketClient(
            api_key=settings.polymarket_api_key,
            api_secret=settings.polymarket_api_secret,
            passphrase=settings.polymarket_api_passphrase,
        )

        # Strategy
        self.strategy_config = load_template(StrategyTemplate.COMBINED)
        self.strategy_config.execution_mode = settings.execution_mode
        self.strategy = StrategyEngine(
            config=self.strategy_config,
            aggregator=self.aggregator,
            indicators=self.indicators,
            polymarket=self.polymarket,
        )

        # Execution
        is_live = settings.execution_mode == "live"
        self.executor = PolymarketExecutor(
            api_key=settings.polymarket_api_key,
            api_secret=settings.polymarket_api_secret,
            passphrase=settings.polymarket_api_passphrase,
            funder=settings.polymarket_funder,
            live=is_live,
        )
        self.position_mgr = PositionManager(
            executor=self.executor,
            balance=settings.paper_balance,
        )

        # Risk
        self.risk_mgr = RiskManager(self.position_mgr)

        # Signal log (all signals, traded or not)
        self.signal_log: list[Signal] = []
        self._running = False
        self._ws_clients: list[asyncio.Queue] = []

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start all subsystems."""
        self._running = True
        tasks = []
        # Exchange feeds
        for feed in self.feeds:
            tasks.append(asyncio.create_task(feed.connect()))
        # Polymarket polling
        tasks.append(asyncio.create_task(self.polymarket.start_polling(interval=5.0)))
        # Main eval loop
        tasks.append(asyncio.create_task(self._eval_loop()))
        # Dashboard broadcaster
        tasks.append(asyncio.create_task(self._broadcast_loop()))
        logger.info("orchestrator_started", mode=settings.execution_mode)
        await asyncio.gather(*tasks, return_exceptions=True)

    async def stop(self) -> None:
        self._running = False
        for feed in self.feeds:
            await feed.stop()
        await self.polymarket.stop()
        await self.executor.close()
        logger.info("orchestrator_stopped")

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def _eval_loop(self) -> None:
        """Periodically evaluate strategy and manage positions."""
        while self._running:
            try:
                # Check exits first
                closed_trades = await self.position_mgr.check_exits(self.strategy_config)
                for t in closed_trades:
                    self.risk_mgr.on_trade_closed(t.pnl, self.strategy_config)

                # Evaluate strategy for new signals
                signals = self.strategy.evaluate()
                for sig in signals:
                    self.signal_log.append(sig)
                    # Risk check
                    check = self.risk_mgr.check(sig, self.strategy_config)
                    if not check:
                        logger.debug("signal_blocked", reason=check.reason, rule=sig.rule_name)
                        continue

                    # Auto-execute if confirmation not required
                    if not self.strategy_config.require_confirmation:
                        await self.position_mgr.open_position(sig, self.strategy_config)

            except Exception:
                logger.exception("eval_loop_error")

            await asyncio.sleep(EVAL_INTERVAL)

    # ------------------------------------------------------------------
    # WebSocket broadcast
    # ------------------------------------------------------------------

    def register_ws_client(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=10)
        self._ws_clients.append(q)
        return q

    def unregister_ws_client(self, q: asyncio.Queue) -> None:
        self._ws_clients = [c for c in self._ws_clients if c is not q]

    async def _broadcast_loop(self) -> None:
        """Send dashboard state to all connected WebSocket clients."""
        while self._running:
            if self._ws_clients:
                state = self.snapshot()
                data = state.to_dict()
                for q in list(self._ws_clients):
                    try:
                        q.put_nowait(data)
                    except asyncio.QueueFull:
                        pass
            await asyncio.sleep(0.5)

    # ------------------------------------------------------------------
    # State snapshot
    # ------------------------------------------------------------------

    def snapshot(self) -> DashboardState:
        prices = {}
        price_changes = {}
        indicators = {}
        for asset in (Asset.ETH, Asset.BTC):
            vwap = self.aggregator.vwap(asset)
            if vwap > 0:
                prices[asset.value] = AggregatedPrice(
                    asset=asset,
                    vwap=vwap,
                    prices=self.aggregator.get_exchange_prices(asset),
                    volumes=self.aggregator.get_exchange_volumes(asset),
                    spread=self.aggregator.spread(asset),
                )
                price_changes[asset.value] = self.indicators.price_change(asset)
                indicators[asset.value] = self.indicators.snapshot(asset)

        return DashboardState(
            prices=prices,
            price_changes=price_changes,
            indicators=indicators,
            markets=self.polymarket.active_markets(),
            signals=self.signal_log[-50:],
            positions=list(self.position_mgr.positions.values()),
            recent_trades=self.position_mgr.recent_trades(20),
            strategy=self.strategy_config,
            pnl_today=self.position_mgr.daily_pnl,
            pnl_total=self.position_mgr.total_pnl,
            win_rate=self.position_mgr.win_rate,
            total_trades=self.position_mgr.total_closed_trades,
            balance=self.position_mgr.balance,
            eth_btc_correlation=self.indicators.correlation(),
            system=SystemStatus(
                exchange_feeds=self.aggregator.get_healths(),
                polymarket=self.polymarket.health,
            ),
        )

    # ------------------------------------------------------------------
    # Strategy management (called from API)
    # ------------------------------------------------------------------

    def update_strategy(self, data: dict) -> None:
        self.strategy_config = strategy_from_dict(data)
        self.strategy.update_config(self.strategy_config)
        logger.info("strategy_updated", name=self.strategy_config.name)

    def load_template(self, template: StrategyTemplate) -> dict:
        self.strategy_config = load_template(template)
        self.strategy.update_config(self.strategy_config)
        logger.info("template_loaded", template=template.value)
        return strategy_to_dict(self.strategy_config)

    async def execute_signal(self, signal_id: str) -> bool:
        """Manually execute a pending signal."""
        for sig in reversed(self.signal_log):
            if sig.id == signal_id:
                check = self.risk_mgr.check(sig, self.strategy_config)
                if not check:
                    return False
                pos = await self.position_mgr.open_position(sig, self.strategy_config)
                return pos is not None
        return False

    async def close_position(self, position_id: str) -> bool:
        trade = await self.position_mgr.close_position(position_id, reason="manual_close")
        if trade:
            self.risk_mgr.on_trade_closed(trade.pnl, self.strategy_config)
            return True
        return False
