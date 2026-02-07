import React from 'react';
import { TrendingUp, TrendingDown, Activity, Clock } from 'lucide-react';

function PriceSection({ symbol, priceData, changeData }) {
  const vwap = priceData?.vwap || 0;
  const prices = priceData?.prices || {};
  const spread = priceData?.spread || 0;
  const pct5m = changeData?.pct_5m || 0;
  const velocity = changeData?.velocity || 0;

  return (
    <div className="price-section">
      <div className="price-section-title">
        {symbol} / USD
        <span className={`price-change ${pct5m >= 0 ? 'up' : 'down'}`} style={{ marginLeft: 8 }}>
          {pct5m >= 0 ? '+' : ''}{pct5m.toFixed(3)}%
        </span>
      </div>

      {Object.entries(prices).map(([exchange, price]) => (
        <div className="price-row" key={exchange}>
          <span className="exchange-name">{exchange}</span>
          <span className="price-value">
            ${Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      ))}

      <div className="vwap-row">
        <span>VWAP</span>
        <span>${Number(vwap).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11, color: '#8b949e' }}>
        <span>Spread: ${spread.toFixed(4)}</span>
        <span>Vel: {velocity >= 0 ? '+' : ''}{velocity.toFixed(4)} $/s</span>
      </div>

      <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#8b949e', flexWrap: 'wrap', paddingTop: 2 }}>
        {[['5s', changeData?.pct_5s], ['15s', changeData?.pct_15s], ['30s', changeData?.pct_30s], ['1m', changeData?.pct_1m]].map(([label, val]) => (
          <span key={label}>
            {label}: <span style={{ color: (val || 0) >= 0 ? '#3fb950' : '#f85149' }}>{(val || 0) >= 0 ? '+' : ''}{(val || 0).toFixed(3)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function DivergenceMeter({ markets, prices }) {
  if (!markets || markets.length === 0) {
    return (
      <div className="divergence-section">
        <div className="price-section-title">
          <Activity size={12} style={{ display: 'inline', marginRight: 4 }} />
          Price vs Odds Divergence
        </div>
        <div style={{ padding: 8, fontSize: 12, color: '#484f58' }}>No active markets</div>
      </div>
    );
  }

  return (
    <div className="divergence-section">
      <div className="price-section-title">
        <Activity size={12} style={{ display: 'inline', marginRight: 4 }} />
        Divergence
      </div>
      {markets.slice(0, 4).map((m, i) => {
        const asset = m.asset || 'ETH';
        const currentPrice = prices?.[asset]?.vwap || 0;
        const distance = currentPrice && m.strike_price ? ((currentPrice - m.strike_price) / m.strike_price * 100) : 0;
        const divergencePct = Math.min(Math.abs(distance) * 10, 100);
        return (
          <div key={m.condition_id || i} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 2 }}>
              {m.question?.slice(0, 40) || `${asset} market`}
            </div>
            <div className="divergence-bar-container">
              <div
                className={`divergence-bar-fill ${divergencePct > 50 ? 'high' : divergencePct > 25 ? 'medium' : 'low'}`}
                style={{ width: `${divergencePct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PolymarketOdds({ markets }) {
  if (!markets || markets.length === 0) {
    return (
      <div className="price-section">
        <div className="price-section-title">Polymarket Odds</div>
        <div className="empty-state"><p>No active markets</p></div>
      </div>
    );
  }

  return (
    <div className="price-section">
      <div className="price-section-title">Polymarket Odds</div>
      {markets.slice(0, 6).map((m, i) => {
        const timeLeft = m.end_time ? Math.max(0, (m.end_time - Date.now() / 1000) / 60) : 0;
        return (
          <div className="odds-row" key={m.condition_id || i}>
            <span className="market-name" title={m.question}>
              {m.asset} {m.strike_price ? `$${Number(m.strike_price).toLocaleString()}` : ''}
            </span>
            <span className="odds-value" style={{ color: m.yes_price > 0.5 ? '#3fb950' : '#f85149' }}>
              {((m.yes_price || 0.5) * 100).toFixed(1)}%
            </span>
            <span style={{ fontSize: 10, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 2 }}>
              <Clock size={10} />{timeLeft.toFixed(1)}m
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function PricePanel({ prices, priceChanges, markets }) {
  const ethPrice = prices?.ETH;
  const btcPrice = prices?.BTC;
  const ethChanges = priceChanges?.ETH;
  const btcChanges = priceChanges?.BTC;

  return (
    <div className="panel left-panel">
      <div className="panel-header">
        <h3><Activity size={14} /> Market Data</h3>
      </div>
      <div className="panel-body">
        <PriceSection symbol="ETH" priceData={ethPrice} changeData={ethChanges} />
        <PriceSection symbol="BTC" priceData={btcPrice} changeData={btcChanges} />
        <DivergenceMeter markets={markets} prices={prices} />
        <PolymarketOdds markets={markets} />
      </div>
    </div>
  );
}
