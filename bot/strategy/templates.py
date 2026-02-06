"""Pre-built strategy templates."""

from bot.models import (
    StrategyConfig, StrategyTemplate, RuleConfig, ConditionConfig,
)


def latency_arbitrage() -> StrategyConfig:
    """Buy when Polymarket odds lag behind exchange price movements."""
    return StrategyConfig(
        name="Latency Arbitrage",
        template=StrategyTemplate.LATENCY_ARB,
        rules=[
            RuleConfig(
                name="PM lagging up-move",
                conditions=[
                    ConditionConfig(metric="price_change_30s", operator="gt", value=0.5),
                    ConditionConfig(metric="polymarket_odds_change", operator="abs_lt", value=2.0),
                    ConditionConfig(metric="time_remaining", operator="gt", value=5.0),
                    ConditionConfig(metric="divergence", operator="gt", value=3.0),
                ],
                logic="AND",
                action_side="YES",
                position_pct=60.0,
                confidence=7,
            ),
            RuleConfig(
                name="PM lagging down-move",
                conditions=[
                    ConditionConfig(metric="price_change_30s", operator="lt", value=-0.5),
                    ConditionConfig(metric="polymarket_odds_change", operator="abs_lt", value=2.0),
                    ConditionConfig(metric="time_remaining", operator="gt", value=5.0),
                    ConditionConfig(metric="divergence", operator="lt", value=-3.0),
                ],
                logic="AND",
                action_side="NO",
                position_pct=60.0,
                confidence=7,
            ),
        ],
        min_edge=3.0,
        price_move_threshold=0.5,
        profit_target_pct=15.0,
        stop_loss_pct=10.0,
        time_exit_minutes=13.0,
        sizing_mode="pct_bankroll",
        bankroll_pct=5.0,
        max_position=300.0,
        latency_threshold_ms=500.0,
    )


def mean_reversion() -> StrategyConfig:
    """Fade sharp price moves expecting them to revert."""
    return StrategyConfig(
        name="Mean Reversion",
        template=StrategyTemplate.MEAN_REVERSION,
        rules=[
            RuleConfig(
                name="Sharp drop revert",
                conditions=[
                    ConditionConfig(metric="price_change_1m", operator="lt", value=-1.5),
                    ConditionConfig(metric="rsi", operator="lt", value=30.0),
                    ConditionConfig(metric="time_remaining", operator="gt", value=8.0),
                ],
                logic="AND",
                action_side="YES",
                position_pct=50.0,
                confidence=6,
            ),
            RuleConfig(
                name="Sharp pump revert",
                conditions=[
                    ConditionConfig(metric="price_change_1m", operator="gt", value=1.5),
                    ConditionConfig(metric="rsi", operator="gt", value=70.0),
                    ConditionConfig(metric="time_remaining", operator="gt", value=8.0),
                ],
                logic="AND",
                action_side="NO",
                position_pct=50.0,
                confidence=6,
            ),
        ],
        min_edge=2.0,
        mean_reversion_threshold=1.5,
        profit_target_pct=10.0,
        stop_loss_pct=12.0,
        time_exit_minutes=12.0,
        trailing_stop_pct=5.0,
    )


def momentum() -> StrategyConfig:
    """Ride strong trends."""
    return StrategyConfig(
        name="Momentum",
        template=StrategyTemplate.MOMENTUM,
        rules=[
            RuleConfig(
                name="Strong uptrend",
                conditions=[
                    ConditionConfig(metric="price_change_5m", operator="gt", value=1.0),
                    ConditionConfig(metric="velocity", operator="gt", value=0.0),
                    ConditionConfig(metric="rsi", operator="between", value=40.0, value2=75.0),
                    ConditionConfig(metric="time_remaining", operator="gt", value=5.0),
                ],
                logic="AND",
                action_side="YES",
                position_pct=40.0,
                confidence=5,
            ),
            RuleConfig(
                name="Strong downtrend",
                conditions=[
                    ConditionConfig(metric="price_change_5m", operator="lt", value=-1.0),
                    ConditionConfig(metric="velocity", operator="lt", value=0.0),
                    ConditionConfig(metric="rsi", operator="between", value=25.0, value2=60.0),
                    ConditionConfig(metric="time_remaining", operator="gt", value=5.0),
                ],
                logic="AND",
                action_side="NO",
                position_pct=40.0,
                confidence=5,
            ),
        ],
        min_edge=2.0,
        profit_target_pct=25.0,
        stop_loss_pct=15.0,
        trailing_stop_pct=8.0,
    )


def combined() -> StrategyConfig:
    """Combines latency arb + mean reversion + momentum signals."""
    lat = latency_arbitrage()
    mr = mean_reversion()
    mom = momentum()
    all_rules = lat.rules + mr.rules + mom.rules
    return StrategyConfig(
        name="Combined",
        template=StrategyTemplate.COMBINED,
        rules=all_rules,
        min_edge=2.5,
        profit_target_pct=15.0,
        stop_loss_pct=12.0,
        trailing_stop_pct=5.0,
        confidence_threshold=5.0,
    )


def blank() -> StrategyConfig:
    """Empty strategy for user to build from scratch."""
    return StrategyConfig(
        name="Custom",
        template=StrategyTemplate.BLANK,
        rules=[],
    )


TEMPLATES: dict[StrategyTemplate, callable] = {
    StrategyTemplate.LATENCY_ARB: latency_arbitrage,
    StrategyTemplate.MEAN_REVERSION: mean_reversion,
    StrategyTemplate.MOMENTUM: momentum,
    StrategyTemplate.COMBINED: combined,
    StrategyTemplate.BLANK: blank,
}


def load_template(template: StrategyTemplate) -> StrategyConfig:
    return TEMPLATES[template]()
