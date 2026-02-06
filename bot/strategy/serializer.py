"""Serialize / deserialize StrategyConfig to/from JSON for persistence and export."""

from __future__ import annotations

import json
from typing import Any

from bot.models import (
    StrategyConfig, StrategyTemplate, RuleConfig, ConditionConfig,
)


def strategy_to_dict(cfg: StrategyConfig) -> dict[str, Any]:
    """Convert StrategyConfig to a JSON-serializable dict."""
    return {
        "name": cfg.name,
        "template": cfg.template.value,
        "rules": [
            {
                "name": r.name,
                "conditions": [
                    {
                        "metric": c.metric,
                        "operator": c.operator,
                        "value": c.value,
                        "value2": c.value2,
                    }
                    for c in r.conditions
                ],
                "logic": r.logic,
                "action_side": r.action_side,
                "position_pct": r.position_pct,
                "confidence": r.confidence,
                "enabled": r.enabled,
            }
            for r in cfg.rules
        ],
        # Entry
        "min_edge": cfg.min_edge,
        "price_move_threshold": cfg.price_move_threshold,
        "volume_filter": cfg.volume_filter,
        "min_time_remaining": cfg.min_time_remaining,
        # Exit
        "profit_target_pct": cfg.profit_target_pct,
        "stop_loss_pct": cfg.stop_loss_pct,
        "time_exit_minutes": cfg.time_exit_minutes,
        "trailing_stop_pct": cfg.trailing_stop_pct,
        "scale_out_pct": cfg.scale_out_pct,
        # Sizing
        "sizing_mode": cfg.sizing_mode,
        "fixed_amount": cfg.fixed_amount,
        "bankroll_pct": cfg.bankroll_pct,
        "max_position": cfg.max_position,
        # Risk
        "max_concurrent": cfg.max_concurrent,
        "max_capital_deployed": cfg.max_capital_deployed,
        "daily_loss_limit": cfg.daily_loss_limit,
        "max_drawdown_pct": cfg.max_drawdown_pct,
        "cooldown_seconds": cfg.cooldown_seconds,
        "blacklisted_markets": cfg.blacklisted_markets,
        # Execution
        "execution_mode": cfg.execution_mode,
        "order_type": cfg.order_type,
        "slippage_tolerance": cfg.slippage_tolerance,
        "require_confirmation": cfg.require_confirmation,
        "auto_rebalance": cfg.auto_rebalance,
        # Tuning
        "mean_reversion_threshold": cfg.mean_reversion_threshold,
        "latency_threshold_ms": cfg.latency_threshold_ms,
        "confidence_threshold": cfg.confidence_threshold,
        "lookback_5m": cfg.lookback_5m,
        "lookback_15m": cfg.lookback_15m,
        "lookback_1h": cfg.lookback_1h,
    }


def strategy_from_dict(data: dict[str, Any]) -> StrategyConfig:
    """Reconstruct a StrategyConfig from a dict."""
    rules = []
    for r in data.get("rules", []):
        conditions = [
            ConditionConfig(
                metric=c["metric"],
                operator=c["operator"],
                value=c.get("value", 0),
                value2=c.get("value2", 0),
            )
            for c in r.get("conditions", [])
        ]
        rules.append(
            RuleConfig(
                name=r["name"],
                conditions=conditions,
                logic=r.get("logic", "AND"),
                action_side=r.get("action_side", "YES"),
                position_pct=r.get("position_pct", 50),
                confidence=r.get("confidence", 5),
                enabled=r.get("enabled", True),
            )
        )

    template = StrategyTemplate.BLANK
    for t in StrategyTemplate:
        if t.value == data.get("template"):
            template = t
            break

    return StrategyConfig(
        name=data.get("name", "Imported"),
        template=template,
        rules=rules,
        min_edge=data.get("min_edge", 2.0),
        price_move_threshold=data.get("price_move_threshold", 0.5),
        volume_filter=data.get("volume_filter", 0),
        min_time_remaining=data.get("min_time_remaining", 2.0),
        profit_target_pct=data.get("profit_target_pct", 20.0),
        stop_loss_pct=data.get("stop_loss_pct", 15.0),
        time_exit_minutes=data.get("time_exit_minutes", 12.0),
        trailing_stop_pct=data.get("trailing_stop_pct", 0),
        scale_out_pct=data.get("scale_out_pct", 0),
        sizing_mode=data.get("sizing_mode", "fixed"),
        fixed_amount=data.get("fixed_amount", 100),
        bankroll_pct=data.get("bankroll_pct", 5),
        max_position=data.get("max_position", 500),
        max_concurrent=data.get("max_concurrent", 5),
        max_capital_deployed=data.get("max_capital_deployed", 2000),
        daily_loss_limit=data.get("daily_loss_limit", 500),
        max_drawdown_pct=data.get("max_drawdown_pct", 20),
        cooldown_seconds=data.get("cooldown_seconds", 60),
        blacklisted_markets=data.get("blacklisted_markets", []),
        execution_mode=data.get("execution_mode", "paper"),
        order_type=data.get("order_type", "market"),
        slippage_tolerance=data.get("slippage_tolerance", 2),
        require_confirmation=data.get("require_confirmation", False),
        auto_rebalance=data.get("auto_rebalance", False),
        mean_reversion_threshold=data.get("mean_reversion_threshold", 1.5),
        latency_threshold_ms=data.get("latency_threshold_ms", 500),
        confidence_threshold=data.get("confidence_threshold", 5),
        lookback_5m=data.get("lookback_5m", 300),
        lookback_15m=data.get("lookback_15m", 900),
        lookback_1h=data.get("lookback_1h", 3600),
    )


def strategy_to_json(cfg: StrategyConfig) -> str:
    return json.dumps(strategy_to_dict(cfg), indent=2)


def strategy_from_json(raw: str) -> StrategyConfig:
    return strategy_from_dict(json.loads(raw))
