"""Tests for the strategy engine and related modules."""

from bot.models import (
    Asset, Side, StrategyConfig, StrategyTemplate,
    RuleConfig, ConditionConfig, PolymarketMarket, SignalDirection,
)
from bot.data.price_feed import PriceAggregator, PriceTick
from bot.data.indicators import IndicatorEngine
from bot.polymarket.client import PolymarketClient
from bot.strategy.engine import StrategyEngine
from bot.strategy.templates import load_template, TEMPLATES
from bot.strategy.serializer import strategy_to_dict, strategy_from_dict, strategy_to_json, strategy_from_json
from bot.risk.manager import RiskManager, RiskCheckResult
from bot.backtest.engine import BacktestEngine, PriceBar
import time


def _make_aggregator_with_data() -> PriceAggregator:
    agg = PriceAggregator()
    now = time.time()
    for i in range(100):
        agg.ingest(PriceTick(
            exchange="binance",
            asset=Asset.ETH,
            price=2500 + i * 0.1,
            volume_24h=1_000_000,
            bid=2499.9 + i * 0.1,
            ask=2500.1 + i * 0.1,
            timestamp=now - 100 + i,
        ))
        agg.ingest(PriceTick(
            exchange="coinbase",
            asset=Asset.ETH,
            price=2500.05 + i * 0.1,
            volume_24h=800_000,
            bid=2499.95 + i * 0.1,
            ask=2500.15 + i * 0.1,
            timestamp=now - 100 + i,
        ))
    return agg


def _make_market() -> PolymarketMarket:
    return PolymarketMarket(
        condition_id="test-market-1",
        question="Will ETH be above $2,500 at 12:15 UTC?",
        asset=Asset.ETH,
        strike_price=2500.0,
        end_time=time.time() + 600,
        yes_price=0.55,
        no_price=0.45,
        yes_token_id="tok_yes",
        no_token_id="tok_no",
        volume=50_000,
        liquidity=10_000,
    )


class TestPriceAggregator:
    def test_vwap(self):
        agg = _make_aggregator_with_data()
        vwap = agg.vwap(Asset.ETH)
        assert vwap > 2500

    def test_pct_change(self):
        agg = _make_aggregator_with_data()
        pct = agg.pct_change(Asset.ETH, 50)
        assert isinstance(pct, float)

    def test_volatility(self):
        agg = _make_aggregator_with_data()
        vol = agg.volatility(Asset.ETH, 60)
        assert vol >= 0

    def test_sma(self):
        agg = _make_aggregator_with_data()
        sma = agg.sma(Asset.ETH, 60)
        assert sma > 0

    def test_rsi(self):
        agg = _make_aggregator_with_data()
        rsi = agg.rsi(Asset.ETH)
        assert 0 <= rsi <= 100

    def test_spread(self):
        agg = _make_aggregator_with_data()
        spread = agg.spread(Asset.ETH)
        assert isinstance(spread, float)


class TestIndicatorEngine:
    def test_price_change(self):
        agg = _make_aggregator_with_data()
        ind = IndicatorEngine(agg)
        pc = ind.price_change(Asset.ETH)
        assert pc.asset == Asset.ETH

    def test_snapshot(self):
        agg = _make_aggregator_with_data()
        ind = IndicatorEngine(agg)
        snap = ind.snapshot(Asset.ETH)
        assert snap.asset == Asset.ETH
        assert snap.sma_5m >= 0

    def test_metric_value(self):
        agg = _make_aggregator_with_data()
        ind = IndicatorEngine(agg)
        val = ind.metric_value(Asset.ETH, "vwap")
        assert val > 0
        unknown = ind.metric_value(Asset.ETH, "nonexistent")
        assert unknown == 0.0


class TestStrategyEngine:
    def test_condition_eval(self):
        assert StrategyEngine._eval_condition(
            ConditionConfig(metric="x", operator="gt", value=5),
            {"x": 10},
        )
        assert not StrategyEngine._eval_condition(
            ConditionConfig(metric="x", operator="gt", value=15),
            {"x": 10},
        )

    def test_between(self):
        assert StrategyEngine._eval_condition(
            ConditionConfig(metric="x", operator="between", value=5, value2=15),
            {"x": 10},
        )

    def test_abs_gt(self):
        assert StrategyEngine._eval_condition(
            ConditionConfig(metric="x", operator="abs_gt", value=5),
            {"x": -10},
        )

    def test_available_metrics(self):
        metrics = StrategyEngine.available_metrics()
        assert len(metrics) > 0
        keys = [m["key"] for m in metrics]
        assert "price_change_5s" in keys
        assert "divergence" in keys


class TestTemplates:
    def test_all_templates_load(self):
        for tmpl in StrategyTemplate:
            config = load_template(tmpl)
            assert isinstance(config, StrategyConfig)
            assert config.name

    def test_combined_has_rules(self):
        config = load_template(StrategyTemplate.COMBINED)
        assert len(config.rules) > 0

    def test_blank_has_no_rules(self):
        config = load_template(StrategyTemplate.BLANK)
        assert len(config.rules) == 0


class TestSerializer:
    def test_round_trip(self):
        original = load_template(StrategyTemplate.LATENCY_ARB)
        data = strategy_to_dict(original)
        restored = strategy_from_dict(data)
        assert restored.name == original.name
        assert len(restored.rules) == len(original.rules)
        assert restored.min_edge == original.min_edge

    def test_json_round_trip(self):
        original = load_template(StrategyTemplate.MEAN_REVERSION)
        json_str = strategy_to_json(original)
        restored = strategy_from_json(json_str)
        assert restored.name == original.name
        assert len(restored.rules) == len(original.rules)


class TestBacktestEngine:
    def test_basic_backtest(self):
        config = load_template(StrategyTemplate.MOMENTUM)
        bars = []
        now = time.time()
        for i in range(100):
            bars.append(PriceBar(
                timestamp=now - 6000 + i * 60,
                open=2500 + i,
                high=2502 + i,
                low=2498 + i,
                close=2501 + i,
                volume=1000,
            ))
        engine = BacktestEngine(initial_balance=10_000)
        result = engine.run(config, {Asset.ETH: bars})
        assert result.strategy_name == "Momentum"
        assert isinstance(result.total_pnl, (int, float))
        result_dict = result.to_dict()
        assert "win_rate" in result_dict
        assert "equity_curve" in result_dict


class TestCorrelation:
    def test_correlation_with_data(self):
        agg = PriceAggregator()
        now = time.time()
        # Add correlated data for both ETH and BTC
        for i in range(100):
            agg.ingest(PriceTick(
                exchange="binance", asset=Asset.ETH,
                price=2500 + i * 0.5,
                volume_24h=1_000_000,
                bid=2499.9, ask=2500.1,
                timestamp=now - 100 + i,
            ))
            agg.ingest(PriceTick(
                exchange="binance", asset=Asset.BTC,
                price=40000 + i * 2.0,  # correlated movement
                volume_24h=1_000_000,
                bid=39999.9, ask=40000.1,
                timestamp=now - 100 + i,
            ))
        ind = IndicatorEngine(agg)
        corr = ind.correlation(seconds=90)
        assert isinstance(corr, float)
        assert -1.0 <= corr <= 1.0

    def test_correlation_no_data(self):
        agg = PriceAggregator()
        ind = IndicatorEngine(agg)
        assert ind.correlation() == 0.0

    def test_correlation_metric(self):
        agg = _make_aggregator_with_data()
        ind = IndicatorEngine(agg)
        val = ind.metric_value(Asset.ETH, "eth_btc_correlation")
        assert isinstance(val, float)


class TestStrategyMetrics:
    def test_correlation_in_available_metrics(self):
        metrics = StrategyEngine.available_metrics()
        keys = [m["key"] for m in metrics]
        assert "eth_btc_correlation" in keys


class TestDBModels:
    def test_trade_record_to_dict(self):
        from bot.db.models import TradeRecord
        record = TradeRecord(
            id="test1", position_id="pos1", market_id="mkt1",
            asset="ETH", side="YES", direction="open",
            price=0.55, size=100.0, quantity=181.8,
            pnl=0.0, rule_name="test_rule", signal_confidence=7.0,
            timestamp=time.time(),
        )
        d = record.to_dict()
        assert d["id"] == "test1"
        assert d["asset"] == "ETH"
        assert d["price"] == 0.55

    def test_strategy_record_to_dict(self):
        from bot.db.models import StrategyRecord
        record = StrategyRecord(
            id=1, name="Test", template="combined",
            config_json={"name": "Test"},
            is_active=True,
            created_at=time.time(), updated_at=time.time(),
        )
        d = record.to_dict()
        assert d["name"] == "Test"
        assert d["is_active"] is True

    def test_daily_pnl_to_dict(self):
        from bot.db.models import DailyPnLRecord
        record = DailyPnLRecord(
            id=1, date="2026-02-07", pnl=150.0,
            trades_count=10, win_count=6, loss_count=4,
            best_trade=50.0, worst_trade=-20.0, balance_eod=10150.0,
        )
        d = record.to_dict()
        assert d["date"] == "2026-02-07"
        assert d["win_count"] == 6


class TestRiskCheckResult:
    def test_allowed(self):
        r = RiskCheckResult(True)
        assert bool(r) is True

    def test_blocked(self):
        r = RiskCheckResult(False, "too risky")
        assert bool(r) is False
        assert r.reason == "too risky"
