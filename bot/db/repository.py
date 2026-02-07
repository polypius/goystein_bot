"""Data access layer for persistent storage."""

from __future__ import annotations

import time
from datetime import datetime, timezone

import structlog
from sqlalchemy import select, desc, update
from sqlalchemy.ext.asyncio import AsyncSession

from bot.db.database import async_session
from bot.db.models import TradeRecord, StrategyRecord, DailyPnLRecord
from bot.models import Trade, StrategyConfig
from bot.strategy.serializer import strategy_to_dict, strategy_from_dict

logger = structlog.get_logger()


class TradeRepository:
    """Persist and query trade records."""

    @staticmethod
    async def save_trade(trade: Trade) -> None:
        async with async_session() as session:
            record = TradeRecord(
                id=trade.id,
                position_id=trade.position_id,
                market_id=trade.market_id,
                asset=trade.asset.value if hasattr(trade.asset, "value") else str(trade.asset),
                side=trade.side.value if hasattr(trade.side, "value") else str(trade.side),
                direction=trade.direction,
                price=trade.price,
                size=trade.size,
                quantity=trade.quantity,
                pnl=trade.pnl,
                rule_name=trade.rule_name,
                signal_confidence=trade.signal_confidence,
                timestamp=trade.timestamp,
            )
            session.add(record)
            await session.commit()

    @staticmethod
    async def get_recent(limit: int = 50) -> list[dict]:
        async with async_session() as session:
            result = await session.execute(
                select(TradeRecord).order_by(desc(TradeRecord.timestamp)).limit(limit)
            )
            return [r.to_dict() for r in result.scalars().all()]

    @staticmethod
    async def get_by_position(position_id: str) -> list[dict]:
        async with async_session() as session:
            result = await session.execute(
                select(TradeRecord)
                .where(TradeRecord.position_id == position_id)
                .order_by(TradeRecord.timestamp)
            )
            return [r.to_dict() for r in result.scalars().all()]

    @staticmethod
    async def get_closed_trades_summary() -> dict:
        async with async_session() as session:
            result = await session.execute(
                select(TradeRecord).where(TradeRecord.direction == "close")
            )
            trades = result.scalars().all()
            if not trades:
                return {"total": 0, "wins": 0, "losses": 0, "total_pnl": 0.0, "win_rate": 0.0}
            wins = sum(1 for t in trades if t.pnl > 0)
            losses = sum(1 for t in trades if t.pnl <= 0)
            total_pnl = sum(t.pnl for t in trades)
            return {
                "total": len(trades),
                "wins": wins,
                "losses": losses,
                "total_pnl": round(total_pnl, 2),
                "win_rate": round(wins / len(trades) * 100, 1) if trades else 0.0,
            }


class StrategyRepository:
    """Persist and query strategy configurations."""

    @staticmethod
    async def save_strategy(config: StrategyConfig) -> int:
        config_dict = strategy_to_dict(config)
        async with async_session() as session:
            # Deactivate all others
            await session.execute(
                update(StrategyRecord).values(is_active=False)
            )
            record = StrategyRecord(
                name=config.name,
                template=config.template.value if hasattr(config.template, "value") else str(config.template),
                config_json=config_dict,
                is_active=True,
                created_at=time.time(),
                updated_at=time.time(),
            )
            session.add(record)
            await session.commit()
            return record.id

    @staticmethod
    async def get_active() -> StrategyConfig | None:
        async with async_session() as session:
            result = await session.execute(
                select(StrategyRecord).where(StrategyRecord.is_active == True).limit(1)
            )
            record = result.scalar_one_or_none()
            if record is None:
                return None
            return strategy_from_dict(record.config_json)

    @staticmethod
    async def list_strategies(limit: int = 20) -> list[dict]:
        async with async_session() as session:
            result = await session.execute(
                select(StrategyRecord).order_by(desc(StrategyRecord.updated_at)).limit(limit)
            )
            return [r.to_dict() for r in result.scalars().all()]


class DailyPnLRepository:
    """Track daily P&L snapshots."""

    @staticmethod
    async def update_today(pnl_delta: float, is_win: bool, balance: float) -> None:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        async with async_session() as session:
            result = await session.execute(
                select(DailyPnLRecord).where(DailyPnLRecord.date == today)
            )
            record = result.scalar_one_or_none()
            if record is None:
                record = DailyPnLRecord(
                    date=today,
                    pnl=pnl_delta,
                    trades_count=1,
                    win_count=1 if is_win else 0,
                    loss_count=0 if is_win else 1,
                    best_trade=max(pnl_delta, 0),
                    worst_trade=min(pnl_delta, 0),
                    balance_eod=balance,
                )
                session.add(record)
            else:
                record.pnl += pnl_delta
                record.trades_count += 1
                if is_win:
                    record.win_count += 1
                else:
                    record.loss_count += 1
                record.best_trade = max(record.best_trade, pnl_delta)
                record.worst_trade = min(record.worst_trade, pnl_delta)
                record.balance_eod = balance
            await session.commit()

    @staticmethod
    async def get_history(days: int = 30) -> list[dict]:
        async with async_session() as session:
            result = await session.execute(
                select(DailyPnLRecord).order_by(desc(DailyPnLRecord.date)).limit(days)
            )
            return [r.to_dict() for r in result.scalars().all()]
