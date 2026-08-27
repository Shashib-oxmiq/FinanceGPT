// ── Market Data Service ──────────────────────────────────────────────────────
// Yahoo Finance API — no API key needed
// Smart symbol resolution for US/NSE/BSE/crypto

import { CONFIG } from "../config";

const BASE = CONFIG.MARKET_BASE_URL;

// ── Smart symbol resolution ──────────────────────────────────────────────────
function resolveSymbol(ticker, market) {
  if (!ticker) return null;
  const t = ticker.toUpperCase().trim();

  // Crypto: BTC-USD, ETH-USD already in Yahoo format
  if (market === "Crypto" || /^(BTC|ETH|SOL|ADA|DOT|XRP|DOGE|MATIC|AVAX|LINK|UNI|ATOM|LTC|BCH|SHIB|PEPE)-?USD$/i.test(t)) {
    return { symbol: t.includes("-USD") ? t : `${t}-USD`, market: "Crypto", currency: "USD" };
  }

  // Indian stocks: NSE suffix
  if (market === "NSE" || market === "BSE") {
    return {
      symbol: market === "BSE" ? `${t}.BO` : `${t}.NS`,
      market,
      currency: "INR",
    };
  }

  // Auto-detect: common Indian tickers
  const indianTickers = ["RELIANCE", "TCS", "INFY", "HDFC", "ICICIBANK", "SBIN", "ITC", "BHARTIARTL", "WIPRO", "LT", "AXISBANK", "KOTAKBANK", "MARUTI", "ASIANPAINT", "BAJFINANCE"];
  if (indianTickers.includes(t) || t.match(/\.NS$|\.BO$/)) {
    return { symbol: t.includes(".") ? t : `${t}.NS`, market: "NSE", currency: "INR" };
  }

  // Default: US market
  return { symbol: t, market: "US", currency: "USD" };
}

// ── Fetch quote ──────────────────────────────────────────────────────────────
export async function fetchQuote(ticker, market) {
  const resolved = resolveSymbol(ticker, market);
  if (!resolved) return null;

  try {
    const resp = await fetch(
      `${BASE}/quote?symbols=${resolved.symbol}&fields=regularMarketPrice,regularMarketChangePercent,marketState,currency,shortName,exchangeName`
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const q = data.quoteResponse?.result?.[0];
    if (!q) return null;

    return {
      symbol: q.symbol,
      live_price: q.regularMarketPrice,
      change_percent: q.regularMarketChangePercent,
      market_state: q.marketState,
      currency: q.currency || resolved.currency,
      exchange: q.exchangeName || resolved.market,
      market: resolved.market,
      name: q.shortName,
    };
  } catch (e) {
    console.error("Market fetch error:", e);
    return null;
  }
}

// ── Fetch quotes for all investments ─────────────────────────────────────────
export async function fetchPortfolioQuotes(investments) {
  const quotes = [];
  for (const inv of investments) {
    if (!inv.ticker) continue;
    const quote = await fetchQuote(inv.ticker, inv.market);
    if (quote) {
      quotes.push({ investment_id: inv.investment_id, ...quote });
    }
  }
  return { quotes };
}

// ── Search stocks ────────────────────────────────────────────────────────────
export async function searchStocks(query) {
  try {
    const resp = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10`
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.quotes || []).map((q) => ({
      symbol: q.symbol,
      name: q.shortname || q.longname || q.symbol,
      exchange: q.exchange,
      type: q.quoteType,
    }));
  } catch (e) {
    return [];
  }
}