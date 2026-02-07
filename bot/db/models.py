"""SQLAlchemy ORM models for persistent storage."""

from __future__ import annotations

import time
from typing import Any

from sqlalchemy import String, Float, Integer, Boolean, JSON, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TradeRecord(Base):
    """Persistent record of every executed trade."""

    __tablename__ = "trades"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    position_id: Mapped[str] = mapped_column(String(32), index=True)
    market_id: Mapped[str] = mapped_column(String(128), index=True)
    asset: Mapped[str] = mapped_column(String(8))
    side: Mapped[str] = mapped_column(String(4))
    direction: Mapped[str] = mapped_column(String(16))  # open / close / scale_out
    price: Mapped[float] = mapped_column(Float)
    size: Mapped[float] = mapped_column(Float)
    quantity: Mapped[float] = mapped_column(Float)
    pnl: Mapped[float] = mapped_column(Float, default=0.0)
    rule_name: Mapped[str] = mapped_column(String(128), default="")
    signal_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    timestamp: Mapped[float] = mapped_column(Float, index=True)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "position_id": self.position_id,
            "market_id": self.market_id,
            "asset": self.asset,
            "side": self.side,
            "direction": self.direction,
            "price": self.price,
            "size": self.size,
            "quantity": self.quantity,
            "pnl": self.pnl,
            "rule_name": self.rule_name,
            "signal_confidence": self.signal_confidence,
            "timestamp": self.timestamp,
        }


class StrategyRecord(Base):
    """Saved strategy configuration."""

    __tablename__ = "strategies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), index=True)
    template: Mapped[str] = mapped_column(String(64), default="combined")
    config_json: Mapped[dict] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    updated_at: Mapped[float] = mapped_column(Float, default=time.time)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "template": self.template,
            "config": self.config_json,
            "is_active": self.is_active,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class DailyPnLRecord(Base):
    """Daily P&L snapshot for historical tracking."""

    __tablename__ = "daily_pnl"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[str] = mapped_column(String(10), unique=True, index=True)  # YYYY-MM-DD
    pnl: Mapped[float] = mapped_column(Float, default=0.0)
    trades_count: Mapped[int] = mapped_column(Integer, default=0)
    win_count: Mapped[int] = mapped_column(Integer, default=0)
    loss_count: Mapped[int] = mapped_column(Integer, default=0)
    best_trade: Mapped[float] = mapped_column(Float, default=0.0)
    worst_trade: Mapped[float] = mapped_column(Float, default=0.0)
    balance_eod: Mapped[float] = mapped_column(Float, default=0.0)

    def to_dict(self) -> dict[str, Any]:
        return {
            "date": self.date,
            "pnl": self.pnl,
            "trades_count": self.trades_count,
            "win_count": self.win_count,
            "loss_count": self.loss_count,
            "best_trade": self.best_trade,
            "worst_trade": self.worst_trade,
            "balance_eod": self.balance_eod,
        }
