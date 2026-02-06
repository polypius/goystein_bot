"""Position and trade management layer."""

from __future__ import annotations

import time
import uuid

import structlog

from bot.models import (
    Asset, Side, Signal, Position, Trade, PositionStatus,
    StrategyConfig, OrderType, PolymarketMarket,
)
from bot.polymarket.executor import PolymarketExecutor

logger = structlog.get_logger()


class PositionManager:
    """Tracks open positions, handles exits, computes P&L."""

    def __init__(self, executor: PolymarketExecutor, balance: float = 10_000.0) -> None:
        self._executor = executor
        self.balance = balance
        self.peak_balance = balance
        self.positions: dict[str, Position] = {}
        self.trades: list[Trade] = []
        self.daily_pnl: float = 0.0
        self._last_trade_time: float = 0.0

    # ------------------------------------------------------------------
    # Open / close
    # ------------------------------------------------------------------

    async def open_position(self, signal: Signal, config: StrategyConfig) -> Position | None:
        """Open a new position from a signal."""
        size = self._compute_size(signal, config)
        if size <= 0:
            return None

        trade = await self._executor.place_order(
            market=signal.market,
            side=signal.side,
            size_usdc=size,
            order_type=OrderType(config.order_type),
        )
        if trade is None:
            return None

        pos_id = str(uuid.uuid4())[:8]
        trade.position_id = pos_id
        trade.rule_name = signal.rule_name
        trade.signal_confidence = signal.confidence

        price = signal.market.yes_price if signal.side == Side.YES else signal.market.no_price
        position = Position(
            id=pos_id,
            market=signal.market,
            side=signal.side,
            entry_price=price,
            size=size,
            quantity=trade.quantity,
            rule_name=signal.rule_name,
            peak_price=price,
        )
        self.positions[pos_id] = position
        self.trades.append(trade)
        self.balance -= size
        self._last_trade_time = time.time()
        logger.info(
            "position_opened",
            id=pos_id,
            asset=signal.asset.value,
            side=signal.side.value,
            size=size,
            price=price,
        )
        return position

    async def close_position(self, pos_id: str, reason: str = "") -> Trade | None:
        pos = self.positions.get(pos_id)
        if not pos or pos.status != PositionStatus.OPEN:
            return None

        current_price = (
            pos.market.yes_price if pos.side == Side.YES else pos.market.no_price
        )
        pnl = (current_price - pos.entry_price) * pos.quantity

        close_side = Side.NO if pos.side == Side.YES else Side.YES
        trade = await self._executor.place_order(
            market=pos.market,
            side=close_side,
            size_usdc=pos.quantity * current_price,
        )
        if trade is None:
            # Paper mode: create synthetic close trade
            trade = Trade(
                id=str(uuid.uuid4())[:8],
                position_id=pos_id,
                market_id=pos.market.condition_id,
                asset=pos.market.asset,
                side=close_side,
                direction="close",
                price=current_price,
                size=pos.quantity * current_price,
                quantity=pos.quantity,
                pnl=pnl,
                rule_name=reason,
            )

        trade.position_id = pos_id
        trade.direction = "close"
        trade.pnl = pnl

        pos.status = PositionStatus.CLOSED
        pos.exit_time = time.time()
        pos.exit_price = current_price
        pos.realized_pnl = pnl
        self.balance += pos.size + pnl
        self.daily_pnl += pnl
        self.peak_balance = max(self.peak_balance, self.balance)
        self.trades.append(trade)

        logger.info(
            "position_closed",
            id=pos_id,
            pnl=round(pnl, 2),
            reason=reason,
        )
        return trade

    # ------------------------------------------------------------------
    # Exit rule checks
    # ------------------------------------------------------------------

    async def check_exits(self, config: StrategyConfig) -> list[Trade]:
        """Check all open positions for exit conditions."""
        closed: list[Trade] = []
        for pos in list(self.positions.values()):
            if pos.status != PositionStatus.OPEN:
                continue

            current_price = (
                pos.market.yes_price if pos.side == Side.YES else pos.market.no_price
            )
            pnl_pct = ((current_price - pos.entry_price) / pos.entry_price * 100) if pos.entry_price else 0

            # Update peak for trailing stop
            pos.peak_price = max(pos.peak_price, current_price)
            pos.unrealized_pnl = (current_price - pos.entry_price) * pos.quantity

            reason = ""

            # Profit target
            if config.profit_target_pct > 0 and pnl_pct >= config.profit_target_pct:
                reason = f"profit_target ({pnl_pct:.1f}%)"

            # Stop loss
            elif config.stop_loss_pct > 0 and pnl_pct <= -config.stop_loss_pct:
                reason = f"stop_loss ({pnl_pct:.1f}%)"

            # Time exit
            elif config.time_exit_minutes > 0:
                held_min = (time.time() - pos.entry_time) / 60
                if held_min >= config.time_exit_minutes:
                    reason = f"time_exit ({held_min:.1f}m)"

            # Trailing stop
            elif config.trailing_stop_pct > 0 and pos.peak_price > pos.entry_price:
                drop_from_peak = ((pos.peak_price - current_price) / pos.peak_price * 100)
                if drop_from_peak >= config.trailing_stop_pct:
                    reason = f"trailing_stop ({drop_from_peak:.1f}% from peak)"

            # Market expired
            elif pos.market.time_remaining_s <= 0:
                reason = "market_expired"

            if reason:
                trade = await self.close_position(pos.id, reason)
                if trade:
                    closed.append(trade)

        return closed

    # ------------------------------------------------------------------
    # Scale out
    # ------------------------------------------------------------------

    async def scale_out(self, pos_id: str, pct: float) -> Trade | None:
        """Close a fraction of a position."""
        pos = self.positions.get(pos_id)
        if not pos or pos.status != PositionStatus.OPEN:
            return None
        # Reduce quantity
        sell_qty = pos.quantity * (pct / 100)
        current_price = pos.market.yes_price if pos.side == Side.YES else pos.market.no_price
        pnl = (current_price - pos.entry_price) * sell_qty

        trade = Trade(
            id=str(uuid.uuid4())[:8],
            position_id=pos_id,
            market_id=pos.market.condition_id,
            asset=pos.market.asset,
            side=pos.side,
            direction="scale_out",
            price=current_price,
            size=sell_qty * current_price,
            quantity=sell_qty,
            pnl=pnl,
        )
        pos.quantity -= sell_qty
        pos.size -= sell_qty * pos.entry_price
        self.balance += sell_qty * current_price
        self.daily_pnl += pnl
        self.trades.append(trade)
        return trade

    # ------------------------------------------------------------------
    # Sizing
    # ------------------------------------------------------------------

    def _compute_size(self, signal: Signal, config: StrategyConfig) -> float:
        if config.sizing_mode == "fixed":
            size = config.fixed_amount
        elif config.sizing_mode == "pct_bankroll":
            size = self.balance * (config.bankroll_pct / 100)
        elif config.sizing_mode == "kelly":
            size = self._kelly_size(signal, config)
        else:
            size = config.fixed_amount

        # Apply rule-level position_pct
        for rule in config.rules:
            if rule.name == signal.rule_name:
                size *= rule.position_pct / 100
                break

        # Cap
        size = min(size, config.max_position, self.balance)
        return max(size, 0)

    def _kelly_size(self, signal: Signal, config: StrategyConfig) -> float:
        """Kelly Criterion sizing: f* = (bp - q) / b where b=odds, p=prob, q=1-p."""
        edge = abs(signal.edge) / 100  # convert to fraction
        prob = 0.5 + edge / 2  # rough estimate
        price = signal.market.yes_price if signal.side == Side.YES else signal.market.no_price
        if price <= 0 or price >= 1:
            return config.fixed_amount
        odds = (1 / price) - 1  # payout odds
        q = 1 - prob
        kelly_frac = (odds * prob - q) / odds
        kelly_frac = max(0, min(kelly_frac, 0.25))  # cap at 25%
        return self.balance * kelly_frac

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    @property
    def open_positions(self) -> list[Position]:
        return [p for p in self.positions.values() if p.status == PositionStatus.OPEN]

    @property
    def capital_deployed(self) -> float:
        return sum(p.size for p in self.open_positions)

    @property
    def total_pnl(self) -> float:
        realized = sum(t.pnl for t in self.trades if t.direction == "close")
        unrealized = sum(p.unrealized_pnl for p in self.open_positions)
        return realized + unrealized

    @property
    def win_rate(self) -> float:
        closed = [t for t in self.trades if t.direction == "close"]
        if not closed:
            return 0.0
        wins = sum(1 for t in closed if t.pnl > 0)
        return wins / len(closed) * 100

    @property
    def total_closed_trades(self) -> int:
        return sum(1 for t in self.trades if t.direction == "close")

    def recent_trades(self, n: int = 20) -> list[Trade]:
        return sorted(self.trades, key=lambda t: t.timestamp, reverse=True)[:n]

    def reset_daily(self) -> None:
        self.daily_pnl = 0.0
