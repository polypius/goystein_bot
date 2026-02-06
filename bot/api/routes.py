"""FastAPI routes and WebSocket endpoint."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from bot.models import StrategyTemplate
from bot.strategy.engine import StrategyEngine
from bot.strategy.serializer import strategy_to_dict, strategy_from_dict
from bot.backtest.engine import BacktestEngine
from bot.backtest.data_loader import fetch_multi_asset_bars

router = APIRouter()

# The orchestrator instance is injected at startup via app.state
_orch = None


def set_orchestrator(orch: Any) -> None:
    global _orch
    _orch = orch


def _get_orch():
    if _orch is None:
        raise HTTPException(503, "Bot not initialized")
    return _orch


# ------------------------------------------------------------------
# Dashboard WebSocket
# ------------------------------------------------------------------

@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    orch = _get_orch()
    await ws.accept()
    queue = orch.register_ws_client()
    try:
        while True:
            data = await queue.get()
            await ws.send_json(data)
    except WebSocketDisconnect:
        pass
    finally:
        orch.unregister_ws_client(queue)


# ------------------------------------------------------------------
# Strategy endpoints
# ------------------------------------------------------------------

@router.get("/api/strategy")
async def get_strategy() -> dict:
    orch = _get_orch()
    return strategy_to_dict(orch.strategy_config)


class StrategyUpdate(BaseModel):
    strategy: dict


@router.put("/api/strategy")
async def update_strategy(body: StrategyUpdate) -> dict:
    orch = _get_orch()
    orch.update_strategy(body.strategy)
    return {"status": "ok", "strategy": strategy_to_dict(orch.strategy_config)}


@router.post("/api/strategy/template/{template_name}")
async def load_template(template_name: str) -> dict:
    orch = _get_orch()
    try:
        tmpl = StrategyTemplate(template_name)
    except ValueError:
        raise HTTPException(400, f"Unknown template: {template_name}")
    data = orch.load_template(tmpl)
    return {"status": "ok", "strategy": data}


@router.get("/api/strategy/templates")
async def list_templates() -> list[dict]:
    return [{"key": t.value, "label": t.value.replace("_", " ").title()} for t in StrategyTemplate]


@router.get("/api/strategy/metrics")
async def list_metrics() -> list[dict]:
    return StrategyEngine.available_metrics()


@router.get("/api/strategy/operators")
async def list_operators() -> list[dict]:
    return StrategyEngine.available_operators()


@router.get("/api/strategy/export")
async def export_strategy() -> dict:
    orch = _get_orch()
    return strategy_to_dict(orch.strategy_config)


class ImportBody(BaseModel):
    strategy: dict


@router.post("/api/strategy/import")
async def import_strategy(body: ImportBody) -> dict:
    orch = _get_orch()
    orch.update_strategy(body.strategy)
    return {"status": "ok"}


# ------------------------------------------------------------------
# Signals & Execution
# ------------------------------------------------------------------

@router.get("/api/signals")
async def get_signals() -> list[dict]:
    orch = _get_orch()
    state = orch.snapshot()
    return [s.__dict__ if hasattr(s, "__dict__") else {} for s in state.signals[-50:]]


class ExecuteBody(BaseModel):
    signal_id: str


@router.post("/api/signals/execute")
async def execute_signal(body: ExecuteBody) -> dict:
    orch = _get_orch()
    ok = await orch.execute_signal(body.signal_id)
    return {"executed": ok}


# ------------------------------------------------------------------
# Positions
# ------------------------------------------------------------------

@router.get("/api/positions")
async def get_positions() -> list[dict]:
    orch = _get_orch()
    state = orch.snapshot()
    return state.to_dict()["positions"]


class CloseBody(BaseModel):
    position_id: str


@router.post("/api/positions/close")
async def close_position(body: CloseBody) -> dict:
    orch = _get_orch()
    ok = await orch.close_position(body.position_id)
    return {"closed": ok}


# ------------------------------------------------------------------
# Trades & Analytics
# ------------------------------------------------------------------

@router.get("/api/trades")
async def get_trades() -> list[dict]:
    orch = _get_orch()
    state = orch.snapshot()
    return state.to_dict()["recent_trades"]


@router.get("/api/analytics")
async def get_analytics() -> dict:
    orch = _get_orch()
    state = orch.snapshot()
    return {
        "pnl_today": state.pnl_today,
        "pnl_total": state.pnl_total,
        "win_rate": state.win_rate,
        "total_trades": state.total_trades,
        "balance": state.balance,
    }


# ------------------------------------------------------------------
# Risk
# ------------------------------------------------------------------

@router.get("/api/risk")
async def get_risk_status() -> dict:
    orch = _get_orch()
    return orch.risk_mgr.status_summary()


@router.post("/api/risk/pause")
async def pause_trading() -> dict:
    orch = _get_orch()
    orch.risk_mgr.pause("manual_pause")
    return {"paused": True}


@router.post("/api/risk/resume")
async def resume_trading() -> dict:
    orch = _get_orch()
    orch.risk_mgr.resume()
    return {"paused": False}


# ------------------------------------------------------------------
# Backtest
# ------------------------------------------------------------------

class BacktestRequest(BaseModel):
    strategy: dict | None = None
    interval: str = "1m"
    limit: int = 1000


@router.post("/api/backtest")
async def run_backtest(body: BacktestRequest) -> dict:
    orch = _get_orch()
    config = strategy_from_dict(body.strategy) if body.strategy else orch.strategy_config
    price_data = await fetch_multi_asset_bars(interval=body.interval, limit=body.limit)
    engine = BacktestEngine(initial_balance=orch.position_mgr.balance)
    result = engine.run(config, price_data)
    return result.to_dict()


# ------------------------------------------------------------------
# System health
# ------------------------------------------------------------------

@router.get("/api/health")
async def health_check() -> dict:
    orch = _get_orch()
    state = orch.snapshot()
    sys = state.to_dict()["system"]
    return {"status": "ok", "system": sys}
