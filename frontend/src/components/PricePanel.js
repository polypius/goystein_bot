import React from 'react';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

function PriceSection({ symbol, data }) {
  const exchanges = data?.exchanges || [];
  const vwap = data?.vwap || 0;
  const change24h = data?.change_24h || 0;

  return (
    <div className="price-section">
      <div className="price-section-title">
        {symbol} / USD
        <span
          className={`price-change ${change24h >= 0 ? 'up' : 'down'}`}
          style={{ marginLeft: 8 }}
        >
          {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
        </span>
      </div>

      {exchanges.map((ex) => (
        <div className="price-row" key={ex.name}>
          <span className="exchange-name">{ex.name}</span>
          <span className="price-value">
            ${Number(ex.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className={`price-change ${ex.change >= 0 ? 'up' : 'down'}`}>
            {ex.change >= 0 ? '+' : ''}{Number(ex.change).toFixed(2)}%
          </span>
        </div>
      ))}

      <div className="vwap-row">
        <span>VWAP</span>
        <span>${Number(vwap).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
    </div>
  );
}

function DivergenceMeter({ divergence }) {
  const value = divergence?.value || 0;
  const level = divergence?.level || 'low';
  const pct = Math.min(Math.max(value * 100, 0), 100);

  return (
    <div className="divergence-section">
      <div className="price-section-title">
        <Activity size={12} style={{ display: 'inline', marginRight: 4 }} />
        Price Divergence
      </div>
      <div className="divergence-bar-container">
        <div
          className={`divergence-bar-fill ${level}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="divergence-labels">
        <span>Low</span>
        <span>{(value * 100).toFixed(2)}%</span>
        <span>High</span>
      </div>
    </div>
  );
}

function PolymarketOdds({ markets }) {
  if (!markets || markets.length === 0) {
    return (
      <div className="price-section">
        <div className="price-section-title">Polymarket Odds</div>
        <div className="empty-state">
          <p>No active markets</p>
        </div>
      </div>
    );
  }

  return (
    <div className="price-section">
      <div className="price-section-title">Polymarket Odds</div>
      {markets.map((m, i) => (
        <div className="odds-row" key={m.id || i}>
          <span className="market-name" title={m.name}>
            {m.name}
          </span>
          <span className="odds-value" style={{ color: m.odds > 0.5 ? '#3fb950' : '#f85149' }}>
            {(m.odds * 100).toFixed(1)}%
          </span>
          <span className={`odds-change ${m.change >= 0 ? 'up' : 'down'}`}>
            {m.change >= 0 ? (
              <TrendingUp size={12} style={{ marginRight: 2 }} />
            ) : (
              <TrendingDown size={12} style={{ marginRight: 2 }} />
            )}
            {m.change >= 0 ? '+' : ''}{(m.change * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

export default function PricePanel({ prices, polymarket, divergence }) {
  const ethData = prices?.ETH || {};
  const btcData = prices?.BTC || {};
  const markets = polymarket?.markets || [];

  return (
    <div className="panel left-panel">
      <div className="panel-header">
        <h3>
          <Activity size={14} />
          Market Data
        </h3>
      </div>
      <div className="panel-body">
        <PriceSection symbol="ETH" data={ethData} />
        <PriceSection symbol="BTC" data={btcData} />
        <DivergenceMeter divergence={divergence} />
        <PolymarketOdds markets={markets} />
      </div>
    </div>
  );
}
