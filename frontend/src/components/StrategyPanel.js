import React, { useState, useCallback } from 'react';
import {
  Settings,
  LogIn,
  LogOut,
  DollarSign,
  Shield,
  Play,
  SlidersHorizontal,
  Layers,
  Plus,
  X,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
  Save,
} from 'lucide-react';
import { API_BASE } from '../hooks/useWebSocket';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: 'builder', label: 'Strategy', icon: Layers },
  { id: 'entry', label: 'Entry', icon: LogIn },
  { id: 'exit', label: 'Exit', icon: LogOut },
  { id: 'sizing', label: 'Sizing', icon: DollarSign },
  { id: 'risk', label: 'Risk', icon: Shield },
  { id: 'execution', label: 'Exec', icon: Play },
  { id: 'tuning', label: 'Tuning', icon: SlidersHorizontal },
];

const METRICS = [
  { value: 'price_change_5s', label: 'Price Change 5s' },
  { value: 'price_change_15s', label: 'Price Change 15s' },
  { value: 'price_change_30s', label: 'Price Change 30s' },
  { value: 'price_change_1m', label: 'Price Change 1m' },
  { value: 'price_change_5m', label: 'Price Change 5m' },
  { value: 'velocity', label: 'Velocity' },
  { value: 'acceleration', label: 'Acceleration' },
  { value: 'volatility_5m', label: 'Volatility 5m' },
  { value: 'volatility_15m', label: 'Volatility 15m' },
  { value: 'sma_5m', label: 'SMA 5m' },
  { value: 'sma_15m', label: 'SMA 15m' },
  { value: 'sma_1h', label: 'SMA 1h' },
  { value: 'rsi', label: 'RSI' },
  { value: 'spread', label: 'Spread' },
  { value: 'polymarket_yes_price', label: 'PM Yes Price' },
  { value: 'polymarket_no_price', label: 'PM No Price' },
  { value: 'polymarket_odds_change', label: 'PM Odds Change' },
  { value: 'time_remaining', label: 'Time Remaining' },
  { value: 'divergence', label: 'Divergence' },
  { value: 'implied_prob', label: 'Implied Prob' },
];

const OPERATORS = [
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '>=' },
  { value: 'lte', label: '<=' },
  { value: 'eq', label: '=' },
  { value: 'between', label: 'between' },
  { value: 'abs_gt', label: '|x| >' },
  { value: 'abs_lt', label: '|x| <' },
];

const DEFAULT_CONFIG = {
  name: 'Combined',
  template: 'combined',
  rules: [],
  min_edge: 2.0,
  price_move_threshold: 0.5,
  volume_filter: 0,
  min_time_remaining: 2.0,
  profit_target_pct: 20.0,
  stop_loss_pct: 15.0,
  time_exit_minutes: 12.0,
  trailing_stop_pct: 0,
  scale_out_pct: 0,
  sizing_mode: 'fixed',
  fixed_amount: 100,
  bankroll_pct: 5,
  max_position: 500,
  max_concurrent: 5,
  max_capital_deployed: 2000,
  daily_loss_limit: 500,
  max_drawdown_pct: 20,
  cooldown_seconds: 60,
  blacklisted_markets: [],
  execution_mode: 'paper',
  order_type: 'market',
  slippage_tolerance: 2,
  require_confirmation: false,
  auto_rebalance: false,
  mean_reversion_threshold: 1.5,
  latency_threshold_ms: 500,
  confidence_threshold: 5,
  lookback_5m: 300,
  lookback_15m: 900,
  lookback_1h: 3600,
};

/* ------------------------------------------------------------------ */
/*  Save helper                                                        */
/* ------------------------------------------------------------------ */

async function saveConfig(config, onSaveResult) {
  try {
    const resp = await fetch(`${API_BASE}/api/strategy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy: config }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      const msg = `Save failed (${resp.status}): ${text}`;
      console.error(msg);
      if (onSaveResult) onSaveResult({ ok: false, error: msg });
      return;
    }
    if (onSaveResult) onSaveResult({ ok: true });
  } catch (err) {
    const msg = `Save error: ${err.message}`;
    console.error(msg);
    if (onSaveResult) onSaveResult({ ok: false, error: msg });
  }
}

/* ------------------------------------------------------------------ */
/*  Shared UI primitives                                               */
/* ------------------------------------------------------------------ */

function SliderRow({ label, value, min, max, step, unit, onChange }) {
  const decimals = step < 1 ? (step < 0.1 ? 2 : 1) : 0;
  return (
    <div className="config-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span className="config-label">{label}</span>
        <span className="config-value">
          {typeof value === 'number' ? value.toFixed(decimals) : value}
          {unit || ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

function ToggleRow({ label, checked, onChange, badge }) {
  return (
    <div className="config-row">
      <span className="config-label">
        {label}
        {badge && (
          <span
            style={{
              marginLeft: 8,
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 700,
              background: badge.bg,
              color: badge.color,
            }}
          >
            {badge.text}
          </span>
        )}
      </span>
      <label className="toggle">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggle-slider" />
      </label>
    </div>
  );
}

function NumberInput({ label, value, onChange, min, max, step, unit }) {
  return (
    <div className="config-row">
      <span className="config-label">{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
        />
        {unit && <span style={{ fontSize: 12, color: '#8b949e' }}>{unit}</span>}
      </div>
    </div>
  );
}

function SelectRow({ label, value, options, onChange }) {
  return (
    <div className="config-row">
      <span className="config-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 1 : Strategy Builder                                           */
/* ------------------------------------------------------------------ */

function ConditionRow({ condition, onUpdate, onDelete }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        background: '#0d1117',
        borderRadius: 4,
        marginBottom: 4,
        flexWrap: 'wrap',
      }}
    >
      <select
        value={condition.metric}
        onChange={(e) => onUpdate({ ...condition, metric: e.target.value })}
        style={{ flex: '1 1 120px', minWidth: 100, fontSize: 12 }}
      >
        {METRICS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>

      <select
        value={condition.operator}
        onChange={(e) => onUpdate({ ...condition, operator: e.target.value })}
        style={{ width: 70, fontSize: 12 }}
      >
        {OPERATORS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <input
        type="number"
        value={condition.value}
        onChange={(e) => onUpdate({ ...condition, value: parseFloat(e.target.value) || 0 })}
        style={{ width: 70, fontSize: 12, textAlign: 'right' }}
        step="any"
        title="value"
      />

      {condition.operator === 'between' && (
        <>
          <span style={{ fontSize: 11, color: '#8b949e' }}>and</span>
          <input
            type="number"
            value={condition.value2}
            onChange={(e) => onUpdate({ ...condition, value2: parseFloat(e.target.value) || 0 })}
            style={{ width: 70, fontSize: 12, textAlign: 'right' }}
            step="any"
            title="value2"
          />
        </>
      )}

      <button
        className="btn btn-outline btn-sm"
        style={{ padding: '2px 5px', flexShrink: 0 }}
        onClick={onDelete}
        title="Remove condition"
      >
        <X size={11} />
      </button>
    </div>
  );
}

function RuleCard({ rule, ruleIndex, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(true);

  const updateField = (key, val) => {
    onUpdate({ ...rule, [key]: val });
  };

  const toggleEnabled = () => updateField('enabled', !rule.enabled);

  /* condition helpers */
  const updateCondition = (cIdx, newCond) => {
    const conds = [...(rule.conditions || [])];
    conds[cIdx] = newCond;
    updateField('conditions', conds);
  };

  const deleteCondition = (cIdx) => {
    const conds = (rule.conditions || []).filter((_, i) => i !== cIdx);
    updateField('conditions', conds);
  };

  const addCondition = () => {
    const conds = [
      ...(rule.conditions || []),
      { metric: 'price_change_30s', operator: 'gt', value: 0, value2: 0 },
    ];
    updateField('conditions', conds);
  };

  return (
    <div
      style={{
        background: '#0d1117',
        border: '1px solid #30363d',
        borderRadius: 8,
        marginBottom: 8,
        opacity: rule.enabled ? 1 : 0.6,
      }}
    >
      {/* Rule header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          onClick={(e) => {
            e.stopPropagation();
            toggleEnabled();
          }}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          {rule.enabled ? (
            <ToggleRight size={20} style={{ color: '#3fb950' }} />
          ) : (
            <ToggleLeft size={20} style={{ color: '#484f58' }} />
          )}
        </span>

        <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{rule.name}</span>

        <span
          style={{
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 4,
            background: rule.action_side === 'YES' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)',
            color: rule.action_side === 'YES' ? '#3fb950' : '#f85149',
            fontWeight: 700,
          }}
        >
          {rule.action_side || 'YES'}
        </span>

        <span style={{ fontSize: 11, color: '#8b949e' }}>
          {rule.logic || 'AND'} | conf {rule.confidence || 5} | {rule.position_pct || 50}%
        </span>

        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}

        <button
          className="btn btn-outline btn-sm"
          style={{ padding: '2px 5px' }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete rule"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Rule body (conditions) */}
      {expanded && (
        <div style={{ padding: '0 12px 12px 12px' }}>
          {/* Conditions */}
          {(rule.conditions || []).length === 0 ? (
            <div style={{ fontSize: 12, color: '#484f58', padding: '8px 0' }}>
              No conditions. Add one below.
            </div>
          ) : (
            (rule.conditions || []).map((cond, ci) => (
              <ConditionRow
                key={ci}
                condition={cond}
                onUpdate={(c) => updateCondition(ci, c)}
                onDelete={() => deleteCondition(ci)}
              />
            ))
          )}

          <button
            className="btn btn-outline btn-sm"
            style={{ marginTop: 4 }}
            onClick={addCondition}
          >
            <Plus size={11} /> Condition
          </button>
        </div>
      )}
    </div>
  );
}

function StrategyBuilder({ config, setConfig, onSaveResult }) {
  const [showDialog, setShowDialog] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    logic: 'AND',
    action_side: 'YES',
    position_pct: 50,
    confidence: 5,
  });

  const rules = config.rules || [];

  const persistRules = (updated) => {
    const newConfig = { ...config, rules: updated };
    setConfig(newConfig);
    saveConfig(newConfig, onSaveResult);
  };

  const updateRule = (index, updatedRule) => {
    const updated = [...rules];
    updated[index] = updatedRule;
    persistRules(updated);
  };

  const removeRule = (index) => {
    persistRules(rules.filter((_, i) => i !== index));
  };

  const addRule = () => {
    if (!newRule.name.trim()) return;
    const rule = {
      name: newRule.name.trim(),
      conditions: [],
      logic: newRule.logic,
      action_side: newRule.action_side,
      position_pct: newRule.position_pct,
      confidence: newRule.confidence,
      enabled: true,
    };
    persistRules([...rules, rule]);
    setNewRule({ name: '', logic: 'AND', action_side: 'YES', position_pct: 50, confidence: 5 });
    setShowDialog(false);
  };

  return (
    <div>
      <div className="config-group">
        <div
          className="config-group-title"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          Active Rules ({rules.length})
          <button className="btn btn-outline btn-sm" onClick={() => setShowDialog(true)}>
            <Plus size={12} /> Add Rule
          </button>
        </div>

        {rules.length === 0 ? (
          <div className="empty-state" style={{ padding: 16 }}>
            <p>No rules configured. Add a rule to get started.</p>
          </div>
        ) : (
          rules.map((rule, i) => (
            <RuleCard
              key={i}
              rule={rule}
              ruleIndex={i}
              onUpdate={(r) => updateRule(i, r)}
              onDelete={() => removeRule(i)}
            />
          ))
        )}
      </div>

      {/* Add-Rule Dialog */}
      {showDialog && (
        <div className="dialog-overlay" onClick={() => setShowDialog(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Add New Rule</h3>

            {/* Name */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#8b949e' }}>
                Rule Name
              </label>
              <input
                type="text"
                value={newRule.name}
                onChange={(e) => setNewRule((r) => ({ ...r, name: e.target.value }))}
                style={{ width: '100%' }}
                placeholder="e.g. PM lagging up-move"
              />
            </div>

            {/* Logic */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#8b949e' }}>
                Logic
              </label>
              <select
                value={newRule.logic}
                onChange={(e) => setNewRule((r) => ({ ...r, logic: e.target.value }))}
                style={{ width: '100%' }}
              >
                <option value="AND">AND (all conditions must match)</option>
                <option value="OR">OR (any condition matches)</option>
              </select>
            </div>

            {/* Action Side */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#8b949e' }}>
                Action Side
              </label>
              <select
                value={newRule.action_side}
                onChange={(e) => setNewRule((r) => ({ ...r, action_side: e.target.value }))}
                style={{ width: '100%' }}
              >
                <option value="YES">YES</option>
                <option value="NO">NO</option>
              </select>
            </div>

            {/* Position % slider */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#8b949e' }}>
                Position Size: {newRule.position_pct}%
              </label>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={newRule.position_pct}
                onChange={(e) =>
                  setNewRule((r) => ({ ...r, position_pct: parseFloat(e.target.value) }))
                }
                style={{ width: '100%' }}
              />
            </div>

            {/* Confidence slider */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#8b949e' }}>
                Confidence: {newRule.confidence} / 10
              </label>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={newRule.confidence}
                onChange={(e) =>
                  setNewRule((r) => ({ ...r, confidence: parseInt(e.target.value, 10) }))
                }
                style={{ width: '100%' }}
              />
            </div>

            <div className="dialog-actions">
              <button className="btn btn-secondary" onClick={() => setShowDialog(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={addRule}>
                Add Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 2 : Entry Rules                                                */
/* ------------------------------------------------------------------ */

function EntryRules({ config, setConfig, onSaveResult }) {
  const update = (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    saveConfig(newConfig, onSaveResult);
  };

  return (
    <div className="config-group">
      <div className="config-group-title">Entry Rules</div>
      <SliderRow
        label="Min Edge"
        value={config.min_edge ?? DEFAULT_CONFIG.min_edge}
        min={0}
        max={10}
        step={0.1}
        unit="%"
        onChange={(v) => update('min_edge', v)}
      />
      <SliderRow
        label="Price Move Threshold"
        value={config.price_move_threshold ?? DEFAULT_CONFIG.price_move_threshold}
        min={0}
        max={5}
        step={0.1}
        unit="%"
        onChange={(v) => update('price_move_threshold', v)}
      />
      <NumberInput
        label="Volume Filter"
        value={config.volume_filter ?? DEFAULT_CONFIG.volume_filter}
        min={0}
        step={1}
        onChange={(v) => update('volume_filter', v)}
      />
      <SliderRow
        label="Min Time Remaining"
        value={config.min_time_remaining ?? DEFAULT_CONFIG.min_time_remaining}
        min={0}
        max={15}
        step={0.5}
        unit=" min"
        onChange={(v) => update('min_time_remaining', v)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 3 : Exit Rules                                                 */
/* ------------------------------------------------------------------ */

function ExitRules({ config, setConfig, onSaveResult }) {
  const update = (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    saveConfig(newConfig, onSaveResult);
  };

  return (
    <div className="config-group">
      <div className="config-group-title">Exit Rules</div>
      <SliderRow
        label="Profit Target"
        value={config.profit_target_pct ?? DEFAULT_CONFIG.profit_target_pct}
        min={0}
        max={50}
        step={0.5}
        unit="%"
        onChange={(v) => update('profit_target_pct', v)}
      />
      <SliderRow
        label="Stop Loss"
        value={config.stop_loss_pct ?? DEFAULT_CONFIG.stop_loss_pct}
        min={0}
        max={50}
        step={0.5}
        unit="%"
        onChange={(v) => update('stop_loss_pct', v)}
      />
      <SliderRow
        label="Time Exit"
        value={config.time_exit_minutes ?? DEFAULT_CONFIG.time_exit_minutes}
        min={1}
        max={15}
        step={0.5}
        unit=" min"
        onChange={(v) => update('time_exit_minutes', v)}
      />
      <SliderRow
        label="Trailing Stop"
        value={config.trailing_stop_pct ?? DEFAULT_CONFIG.trailing_stop_pct}
        min={0}
        max={20}
        step={0.5}
        unit="%"
        onChange={(v) => update('trailing_stop_pct', v)}
      />
      <SliderRow
        label="Scale Out"
        value={config.scale_out_pct ?? DEFAULT_CONFIG.scale_out_pct}
        min={0}
        max={100}
        step={5}
        unit="%"
        onChange={(v) => update('scale_out_pct', v)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 4 : Position Sizing                                            */
/* ------------------------------------------------------------------ */

function PositionSizing({ config, setConfig, onSaveResult }) {
  const update = (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    saveConfig(newConfig, onSaveResult);
  };

  const sizingMode = config.sizing_mode ?? DEFAULT_CONFIG.sizing_mode;

  return (
    <div className="config-group">
      <div className="config-group-title">Position Sizing</div>
      <SelectRow
        label="Sizing Mode"
        value={sizingMode}
        options={[
          { value: 'fixed', label: 'Fixed Amount' },
          { value: 'pct_bankroll', label: '% of Bankroll' },
          { value: 'kelly', label: 'Kelly Criterion' },
        ]}
        onChange={(v) => update('sizing_mode', v)}
      />

      {sizingMode === 'fixed' && (
        <NumberInput
          label="Fixed Amount ($)"
          value={config.fixed_amount ?? DEFAULT_CONFIG.fixed_amount}
          min={1}
          step={10}
          unit="$"
          onChange={(v) => update('fixed_amount', v)}
        />
      )}

      {sizingMode === 'pct_bankroll' && (
        <SliderRow
          label="Bankroll %"
          value={config.bankroll_pct ?? DEFAULT_CONFIG.bankroll_pct}
          min={0.5}
          max={25}
          step={0.5}
          unit="%"
          onChange={(v) => update('bankroll_pct', v)}
        />
      )}

      {sizingMode === 'kelly' && (
        <SliderRow
          label="Bankroll %"
          value={config.bankroll_pct ?? DEFAULT_CONFIG.bankroll_pct}
          min={0.5}
          max={25}
          step={0.5}
          unit="%"
          onChange={(v) => update('bankroll_pct', v)}
        />
      )}

      <NumberInput
        label="Max Position ($)"
        value={config.max_position ?? DEFAULT_CONFIG.max_position}
        min={1}
        step={50}
        unit="$"
        onChange={(v) => update('max_position', v)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 5 : Risk Management                                            */
/* ------------------------------------------------------------------ */

function RiskManagement({ config, setConfig, onSaveResult }) {
  const update = (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    saveConfig(newConfig, onSaveResult);
  };

  return (
    <div className="config-group">
      <div className="config-group-title">Risk Management</div>
      <SliderRow
        label="Max Concurrent Positions"
        value={config.max_concurrent ?? DEFAULT_CONFIG.max_concurrent}
        min={1}
        max={10}
        step={1}
        onChange={(v) => update('max_concurrent', v)}
      />
      <NumberInput
        label="Max Capital Deployed ($)"
        value={config.max_capital_deployed ?? DEFAULT_CONFIG.max_capital_deployed}
        min={0}
        step={100}
        unit="$"
        onChange={(v) => update('max_capital_deployed', v)}
      />
      <NumberInput
        label="Daily Loss Limit ($)"
        value={config.daily_loss_limit ?? DEFAULT_CONFIG.daily_loss_limit}
        min={0}
        step={50}
        unit="$"
        onChange={(v) => update('daily_loss_limit', v)}
      />
      <SliderRow
        label="Max Drawdown"
        value={config.max_drawdown_pct ?? DEFAULT_CONFIG.max_drawdown_pct}
        min={1}
        max={50}
        step={1}
        unit="%"
        onChange={(v) => update('max_drawdown_pct', v)}
      />
      <SliderRow
        label="Cooldown"
        value={config.cooldown_seconds ?? DEFAULT_CONFIG.cooldown_seconds}
        min={0}
        max={300}
        step={5}
        unit="s"
        onChange={(v) => update('cooldown_seconds', v)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 6 : Execution                                                  */
/* ------------------------------------------------------------------ */

function ExecutionConfig({ config, setConfig, onSaveResult }) {
  const update = (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    saveConfig(newConfig, onSaveResult);
  };

  const isLive = (config.execution_mode ?? DEFAULT_CONFIG.execution_mode) === 'live';

  return (
    <div className="config-group">
      <div className="config-group-title">Execution Settings</div>
      <ToggleRow
        label="Execution Mode"
        checked={isLive}
        onChange={(v) => update('execution_mode', v ? 'live' : 'paper')}
        badge={{
          text: isLive ? 'LIVE' : 'PAPER',
          bg: isLive ? 'rgba(248,81,73,0.15)' : 'rgba(210,153,34,0.15)',
          color: isLive ? '#f85149' : '#d29922',
        }}
      />
      <SelectRow
        label="Order Type"
        value={config.order_type ?? DEFAULT_CONFIG.order_type}
        options={[
          { value: 'market', label: 'Market' },
          { value: 'limit', label: 'Limit' },
        ]}
        onChange={(v) => update('order_type', v)}
      />
      <SliderRow
        label="Slippage Tolerance"
        value={config.slippage_tolerance ?? DEFAULT_CONFIG.slippage_tolerance}
        min={0}
        max={10}
        step={0.5}
        unit="%"
        onChange={(v) => update('slippage_tolerance', v)}
      />
      <ToggleRow
        label="Require Confirmation"
        checked={config.require_confirmation ?? DEFAULT_CONFIG.require_confirmation}
        onChange={(v) => update('require_confirmation', v)}
      />
      <ToggleRow
        label="Auto Rebalance"
        checked={config.auto_rebalance ?? DEFAULT_CONFIG.auto_rebalance}
        onChange={(v) => update('auto_rebalance', v)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 7 : Parameter Tuning                                           */
/* ------------------------------------------------------------------ */

function ParameterTuning({ config, setConfig, onSaveResult }) {
  const update = (key, value) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    saveConfig(newConfig, onSaveResult);
  };

  return (
    <div className="config-group">
      <div className="config-group-title">Parameter Tuning</div>
      <SliderRow
        label="Mean Reversion Threshold"
        value={config.mean_reversion_threshold ?? DEFAULT_CONFIG.mean_reversion_threshold}
        min={0.1}
        max={5.0}
        step={0.1}
        unit=" sigma"
        onChange={(v) => update('mean_reversion_threshold', v)}
      />
      <SliderRow
        label="Latency Threshold"
        value={config.latency_threshold_ms ?? DEFAULT_CONFIG.latency_threshold_ms}
        min={50}
        max={2000}
        step={50}
        unit=" ms"
        onChange={(v) => update('latency_threshold_ms', v)}
      />
      <SliderRow
        label="Confidence Threshold"
        value={config.confidence_threshold ?? DEFAULT_CONFIG.confidence_threshold}
        min={1}
        max={10}
        step={1}
        onChange={(v) => update('confidence_threshold', v)}
      />

      <div className="config-group-title" style={{ marginTop: 16 }}>
        Lookback Windows
      </div>
      <SliderRow
        label="Lookback 5m"
        value={config.lookback_5m ?? DEFAULT_CONFIG.lookback_5m}
        min={60}
        max={600}
        step={30}
        unit="s"
        onChange={(v) => update('lookback_5m', v)}
      />
      <SliderRow
        label="Lookback 15m"
        value={config.lookback_15m ?? DEFAULT_CONFIG.lookback_15m}
        min={300}
        max={1800}
        step={60}
        unit="s"
        onChange={(v) => update('lookback_15m', v)}
      />
      <SliderRow
        label="Lookback 1h"
        value={config.lookback_1h ?? DEFAULT_CONFIG.lookback_1h}
        min={1800}
        max={7200}
        step={300}
        unit="s"
        onChange={(v) => update('lookback_1h', v)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Panel export                                                  */
/* ------------------------------------------------------------------ */

export default function StrategyPanel({ config: initialConfig, onSaveResult }) {
  const [activeTab, setActiveTab] = useState('builder');
  const [config, setConfig] = useState(() => ({ ...DEFAULT_CONFIG, ...(initialConfig || {}) }));
  const [saveStatus, setSaveStatus] = useState(null); // null | 'ok' | 'error'

  const handleSaveResult = useCallback(
    (result) => {
      setSaveStatus(result.ok ? 'ok' : 'error');
      setTimeout(() => setSaveStatus(null), 2500);
      if (onSaveResult) onSaveResult(result);
    },
    [onSaveResult],
  );

  const updateConfig = useCallback((newConfig) => {
    setConfig(newConfig);
  }, []);

  // Sync with incoming props when they change
  React.useEffect(() => {
    if (initialConfig) {
      setConfig((prev) => {
        const incoming = JSON.stringify(initialConfig);
        const current = JSON.stringify(prev);
        if (incoming !== current) return { ...DEFAULT_CONFIG, ...initialConfig };
        return prev;
      });
    }
  }, [initialConfig]);

  const tabProps = { config, setConfig: updateConfig, onSaveResult: handleSaveResult };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'builder':
        return <StrategyBuilder {...tabProps} />;
      case 'entry':
        return <EntryRules {...tabProps} />;
      case 'exit':
        return <ExitRules {...tabProps} />;
      case 'sizing':
        return <PositionSizing {...tabProps} />;
      case 'risk':
        return <RiskManagement {...tabProps} />;
      case 'execution':
        return <ExecutionConfig {...tabProps} />;
      case 'tuning':
        return <ParameterTuning {...tabProps} />;
      default:
        return null;
    }
  };

  return (
    <div className="panel right-panel">
      <div className="panel-header">
        <h3>
          <Settings size={14} />
          Strategy Config
        </h3>
        {saveStatus && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 4,
              background:
                saveStatus === 'ok' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)',
              color: saveStatus === 'ok' ? '#3fb950' : '#f85149',
              transition: 'opacity 0.3s',
            }}
          >
            {saveStatus === 'ok' ? 'Saved' : 'Save failed'}
          </span>
        )}
      </div>
      <div className="tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
            >
              <Icon size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="panel-body">{renderTabContent()}</div>
    </div>
  );
}
