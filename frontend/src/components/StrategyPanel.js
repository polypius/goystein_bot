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
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

const TABS = [
  { id: 'builder', label: 'Strategy', icon: Layers },
  { id: 'entry', label: 'Entry', icon: LogIn },
  { id: 'exit', label: 'Exit', icon: LogOut },
  { id: 'sizing', label: 'Sizing', icon: DollarSign },
  { id: 'risk', label: 'Risk', icon: Shield },
  { id: 'execution', label: 'Exec', icon: Play },
  { id: 'tuning', label: 'Tuning', icon: SlidersHorizontal },
];

function saveConfig(config) {
  fetch('/api/strategy', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }).catch((err) => console.error('Failed to save strategy config:', err));
}

function SliderRow({ label, value, min, max, step, unit, onChange }) {
  return (
    <div className="config-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span className="config-label">{label}</span>
        <span className="config-value">
          {typeof value === 'number' ? value.toFixed(step < 1 ? 2 : 0) : value}
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

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="config-row">
      <span className="config-label">{label}</span>
      <label className="toggle">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggle-slider" />
      </label>
    </div>
  );
}

function StrategyBuilder({ config, setConfig }) {
  const [showDialog, setShowDialog] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleType, setNewRuleType] = useState('entry');

  const rules = config.rules || [];

  const toggleRule = (index) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    const newConfig = { ...config, rules: updated };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  const removeRule = (index) => {
    const updated = rules.filter((_, i) => i !== index);
    const newConfig = { ...config, rules: updated };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  const addRule = () => {
    if (!newRuleName.trim()) return;
    const updated = [
      ...rules,
      { name: newRuleName, type: newRuleType, enabled: true },
    ];
    const newConfig = { ...config, rules: updated };
    setConfig(newConfig);
    saveConfig(newConfig);
    setNewRuleName('');
    setShowDialog(false);
  };

  return (
    <div>
      <div className="config-group">
        <div className="config-group-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Active Rules
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
            <div className="rule-item" key={i}>
              <span
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                onClick={() => toggleRule(i)}
              >
                {rule.enabled ? (
                  <ToggleRight size={20} style={{ color: '#3fb950' }} />
                ) : (
                  <ToggleLeft size={20} style={{ color: '#484f58' }} />
                )}
              </span>
              <span className="rule-name" style={{ opacity: rule.enabled ? 1 : 0.5 }}>
                {rule.name}
              </span>
              <span className="rule-status" style={{ textTransform: 'uppercase', fontSize: 10 }}>
                {rule.type}
              </span>
              <button
                className="btn btn-outline btn-sm"
                style={{ padding: '2px 6px' }}
                onClick={() => removeRule(i)}
              >
                <X size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      {showDialog && (
        <div className="dialog-overlay" onClick={() => setShowDialog(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Add New Rule</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#8b949e' }}>
                Rule Name
              </label>
              <input
                type="text"
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
                style={{ width: '100%' }}
                placeholder="e.g. Min Volume Filter"
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#8b949e' }}>
                Rule Type
              </label>
              <select value={newRuleType} onChange={(e) => setNewRuleType(e.target.value)} style={{ width: '100%' }}>
                <option value="entry">Entry</option>
                <option value="exit">Exit</option>
                <option value="filter">Filter</option>
                <option value="sizing">Sizing</option>
              </select>
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

function EntryRules({ config, setConfig }) {
  const entry = config.entry || {};

  const update = (key, value) => {
    const newConfig = { ...config, entry: { ...entry, [key]: value } };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  return (
    <div className="config-group">
      <div className="config-group-title">Entry Rules</div>
      <SliderRow
        label="Min Edge"
        value={entry.min_edge || 0.02}
        min={0}
        max={0.1}
        step={0.005}
        unit="%"
        onChange={(v) => update('min_edge', v)}
      />
      <SliderRow
        label="Price Threshold"
        value={entry.price_threshold || 0.5}
        min={0}
        max={5}
        step={0.1}
        unit="%"
        onChange={(v) => update('price_threshold', v)}
      />
      <ToggleRow
        label="Volume Filter"
        checked={entry.volume_filter !== false}
        onChange={(v) => update('volume_filter', v)}
      />
      <ToggleRow
        label="Time Filter"
        checked={entry.time_filter !== false}
        onChange={(v) => update('time_filter', v)}
      />
    </div>
  );
}

function ExitRules({ config, setConfig }) {
  const exit = config.exit || {};

  const update = (key, value) => {
    const newConfig = { ...config, exit: { ...exit, [key]: value } };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  return (
    <div className="config-group">
      <div className="config-group-title">Exit Rules</div>
      <SliderRow
        label="Profit Target"
        value={exit.profit_target || 0.05}
        min={0.01}
        max={0.3}
        step={0.01}
        unit="%"
        onChange={(v) => update('profit_target', v)}
      />
      <SliderRow
        label="Stop Loss"
        value={exit.stop_loss || 0.03}
        min={0.005}
        max={0.15}
        step={0.005}
        unit="%"
        onChange={(v) => update('stop_loss', v)}
      />
      <SliderRow
        label="Time Exit (min)"
        value={exit.time_exit_minutes || 60}
        min={5}
        max={480}
        step={5}
        onChange={(v) => update('time_exit_minutes', v)}
      />
      <SliderRow
        label="Trailing Stop"
        value={exit.trailing_stop || 0.02}
        min={0.005}
        max={0.1}
        step={0.005}
        unit="%"
        onChange={(v) => update('trailing_stop', v)}
      />
    </div>
  );
}

function PositionSizing({ config, setConfig }) {
  const sizing = config.position_sizing || {};

  const update = (key, value) => {
    const newConfig = { ...config, position_sizing: { ...sizing, [key]: value } };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  return (
    <div className="config-group">
      <div className="config-group-title">Position Sizing</div>
      <div className="config-row">
        <span className="config-label">Mode</span>
        <select
          value={sizing.mode || 'fixed'}
          onChange={(e) => update('mode', e.target.value)}
        >
          <option value="fixed">Fixed Amount</option>
          <option value="pct">% of Capital</option>
          <option value="kelly">Kelly Criterion</option>
        </select>
      </div>

      {(sizing.mode === 'fixed' || !sizing.mode) && (
        <div className="config-row">
          <span className="config-label">Fixed Amount ($)</span>
          <input
            type="number"
            value={sizing.fixed_amount || 100}
            onChange={(e) => update('fixed_amount', parseFloat(e.target.value) || 0)}
            min={0}
          />
        </div>
      )}

      {sizing.mode === 'pct' && (
        <SliderRow
          label="% of Capital"
          value={sizing.pct_amount || 5}
          min={0.5}
          max={25}
          step={0.5}
          unit="%"
          onChange={(v) => update('pct_amount', v)}
        />
      )}

      {sizing.mode === 'kelly' && (
        <SliderRow
          label="Kelly Fraction"
          value={sizing.kelly_fraction || 0.25}
          min={0.05}
          max={1.0}
          step={0.05}
          onChange={(v) => update('kelly_fraction', v)}
        />
      )}

      <div className="config-row">
        <span className="config-label">Max Position ($)</span>
        <input
          type="number"
          value={sizing.max_position || 1000}
          onChange={(e) => update('max_position', parseFloat(e.target.value) || 0)}
          min={0}
        />
      </div>
    </div>
  );
}

function RiskManagement({ config, setConfig }) {
  const risk = config.risk || {};

  const update = (key, value) => {
    const newConfig = { ...config, risk: { ...risk, [key]: value } };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  return (
    <div className="config-group">
      <div className="config-group-title">Risk Management</div>
      <SliderRow
        label="Max Concurrent Positions"
        value={risk.max_concurrent || 3}
        min={1}
        max={10}
        step={1}
        onChange={(v) => update('max_concurrent', v)}
      />
      <div className="config-row">
        <span className="config-label">Max Capital ($)</span>
        <input
          type="number"
          value={risk.max_capital || 5000}
          onChange={(e) => update('max_capital', parseFloat(e.target.value) || 0)}
          min={0}
        />
      </div>
      <div className="config-row">
        <span className="config-label">Daily Loss Limit ($)</span>
        <input
          type="number"
          value={risk.daily_loss_limit || 500}
          onChange={(e) => update('daily_loss_limit', parseFloat(e.target.value) || 0)}
          min={0}
        />
      </div>
      <SliderRow
        label="Max Drawdown"
        value={risk.max_drawdown || 0.1}
        min={0.01}
        max={0.5}
        step={0.01}
        unit="%"
        onChange={(v) => update('max_drawdown', v)}
      />
      <SliderRow
        label="Cooldown (min)"
        value={risk.cooldown_minutes || 5}
        min={0}
        max={60}
        step={1}
        onChange={(v) => update('cooldown_minutes', v)}
      />
    </div>
  );
}

function ExecutionConfig({ config, setConfig }) {
  const exec = config.execution || {};

  const update = (key, value) => {
    const newConfig = { ...config, execution: { ...exec, [key]: value } };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  return (
    <div className="config-group">
      <div className="config-group-title">Execution Settings</div>
      <div className="config-row">
        <span className="config-label">
          Mode
          <span
            style={{
              marginLeft: 8,
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 700,
              background: exec.mode === 'live' ? 'rgba(248, 81, 73, 0.15)' : 'rgba(210, 153, 34, 0.15)',
              color: exec.mode === 'live' ? '#f85149' : '#d29922',
            }}
          >
            {(exec.mode || 'paper').toUpperCase()}
          </span>
        </span>
        <label className="toggle">
          <input
            type="checkbox"
            checked={exec.mode === 'live'}
            onChange={(e) => update('mode', e.target.checked ? 'live' : 'paper')}
          />
          <span className="toggle-slider" />
        </label>
      </div>
      <div className="config-row">
        <span className="config-label">Order Type</span>
        <select
          value={exec.order_type || 'limit'}
          onChange={(e) => update('order_type', e.target.value)}
        >
          <option value="limit">Limit</option>
          <option value="market">Market</option>
          <option value="ioc">IOC</option>
        </select>
      </div>
      <SliderRow
        label="Max Slippage"
        value={exec.max_slippage || 0.005}
        min={0.001}
        max={0.05}
        step={0.001}
        unit="%"
        onChange={(v) => update('max_slippage', v)}
      />
      <ToggleRow
        label="Require Confirmation"
        checked={exec.confirmation !== false}
        onChange={(v) => update('confirmation', v)}
      />
    </div>
  );
}

function ParameterTuning({ config, setConfig }) {
  const tuning = config.tuning || {};

  const update = (key, value) => {
    const newConfig = { ...config, tuning: { ...tuning, [key]: value } };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  return (
    <div className="config-group">
      <div className="config-group-title">Parameter Tuning</div>
      <SliderRow
        label="Mean Reversion Threshold (sigma)"
        value={tuning.mean_reversion_threshold || 2.0}
        min={0.5}
        max={5.0}
        step={0.1}
        onChange={(v) => update('mean_reversion_threshold', v)}
      />
      <SliderRow
        label="Latency Threshold (ms)"
        value={tuning.latency_threshold_ms || 100}
        min={10}
        max={500}
        step={10}
        unit="ms"
        onChange={(v) => update('latency_threshold_ms', v)}
      />
      <SliderRow
        label="Confidence Threshold"
        value={tuning.confidence_threshold || 0.7}
        min={0.1}
        max={1.0}
        step={0.05}
        onChange={(v) => update('confidence_threshold', v)}
      />
    </div>
  );
}

export default function StrategyPanel({ config: initialConfig }) {
  const [activeTab, setActiveTab] = useState('builder');
  const [config, setConfig] = useState(initialConfig || {});

  const updateConfig = useCallback((newConfig) => {
    setConfig(newConfig);
  }, []);

  // Sync with incoming props when they change
  React.useEffect(() => {
    if (initialConfig) {
      setConfig((prev) => {
        // Only update if the incoming config is structurally different
        const incoming = JSON.stringify(initialConfig);
        const current = JSON.stringify(prev);
        if (incoming !== current) return initialConfig;
        return prev;
      });
    }
  }, [initialConfig]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'builder':
        return <StrategyBuilder config={config} setConfig={updateConfig} />;
      case 'entry':
        return <EntryRules config={config} setConfig={updateConfig} />;
      case 'exit':
        return <ExitRules config={config} setConfig={updateConfig} />;
      case 'sizing':
        return <PositionSizing config={config} setConfig={updateConfig} />;
      case 'risk':
        return <RiskManagement config={config} setConfig={updateConfig} />;
      case 'execution':
        return <ExecutionConfig config={config} setConfig={updateConfig} />;
      case 'tuning':
        return <ParameterTuning config={config} setConfig={updateConfig} />;
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
