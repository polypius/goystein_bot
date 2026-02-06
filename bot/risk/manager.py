"""Risk management checks applied before every trade."""

from __future__ import annotations

import time

import structlog

from bot.models import Signal, StrategyConfig
from bot.execution.manager import PositionManager

logger = structlog.get_logger()


class RiskCheckResult:
    def __init__(self, allowed: bool, reason: str = "") -> None:
        self.allowed = allowed
        self.reason = reason

    def __bool__(self) -> bool:
        return self.allowed


class RiskManager:
    """Centralized risk gate that must approve every trade."""

    def __init__(self, position_mgr: PositionManager) -> None:
        self._pm = position_mgr
        self._paused = False
        self._pause_reason = ""
        self._cooldown_until: float = 0.0
        self._consecutive_losses: int = 0

    @property
    def is_paused(self) -> bool:
        return self._paused

    @property
    def pause_reason(self) -> str:
        return self._pause_reason

    def pause(self, reason: str) -> None:
        self._paused = True
        self._pause_reason = reason
        logger.warning("risk_paused", reason=reason)

    def resume(self) -> None:
        self._paused = False
        self._pause_reason = ""

    # ------------------------------------------------------------------
    # Pre-trade check
    # ------------------------------------------------------------------

    def check(self, signal: Signal, config: StrategyConfig) -> RiskCheckResult:
        """Run all risk checks. Returns RiskCheckResult."""

        if self._paused:
            return RiskCheckResult(False, f"Trading paused: {self._pause_reason}")

        # Cooldown
        if time.time() < self._cooldown_until:
            remaining = self._cooldown_until - time.time()
            return RiskCheckResult(False, f"Cooldown active ({remaining:.0f}s remaining)")

        # Max concurrent positions
        open_count = len(self._pm.open_positions)
        if open_count >= config.max_concurrent:
            return RiskCheckResult(False, f"Max concurrent positions ({config.max_concurrent})")

        # Max capital deployed
        deployed = self._pm.capital_deployed
        if deployed >= config.max_capital_deployed:
            return RiskCheckResult(
                False, f"Max capital deployed (${deployed:.0f} / ${config.max_capital_deployed:.0f})"
            )

        # Daily loss limit
        if config.daily_loss_limit > 0 and self._pm.daily_pnl <= -config.daily_loss_limit:
            self.pause(f"Daily loss limit hit (${self._pm.daily_pnl:.0f})")
            return RiskCheckResult(False, "Daily loss limit reached")

        # Maximum drawdown
        if config.max_drawdown_pct > 0:
            peak = self._pm.peak_balance
            if peak > 0:
                dd_pct = ((peak - self._pm.balance) / peak) * 100
                if dd_pct >= config.max_drawdown_pct:
                    self.pause(f"Max drawdown ({dd_pct:.1f}%)")
                    return RiskCheckResult(False, f"Max drawdown reached ({dd_pct:.1f}%)")

        # Blacklisted market
        if signal.market.condition_id in config.blacklisted_markets:
            return RiskCheckResult(False, "Market is blacklisted")

        # Minimum balance
        if self._pm.balance < 10:
            return RiskCheckResult(False, "Insufficient balance")

        return RiskCheckResult(True)

    # ------------------------------------------------------------------
    # Post-trade hooks
    # ------------------------------------------------------------------

    def on_trade_closed(self, pnl: float, config: StrategyConfig) -> None:
        """Called after a position is closed to update risk state."""
        if pnl < 0:
            self._consecutive_losses += 1
            if self._consecutive_losses >= 3 and config.cooldown_seconds > 0:
                self._cooldown_until = time.time() + config.cooldown_seconds
                logger.info(
                    "cooldown_activated",
                    consecutive_losses=self._consecutive_losses,
                    seconds=config.cooldown_seconds,
                )
        else:
            self._consecutive_losses = 0

    def status_summary(self) -> dict:
        return {
            "paused": self._paused,
            "pause_reason": self._pause_reason,
            "cooldown_until": self._cooldown_until,
            "consecutive_losses": self._consecutive_losses,
            "balance": self._pm.balance,
            "daily_pnl": self._pm.daily_pnl,
            "capital_deployed": self._pm.capital_deployed,
            "open_positions": len(self._pm.open_positions),
        }
