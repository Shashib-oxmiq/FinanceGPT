"""
Market data routes — real-time stock prices and investment news.

Uses free, no-API-key data sources:
  - Yahoo Finance (query1.finance.yahoo.com) for stock quotes
  - Google News RSS (news.google.com) for investment news

Endpoints:
  GET  /api/market/quote?symbol=AAPL           → latest price for a single symbol
  GET  /api/market/quotes?symbols=AAPL,MSFT    → batch quotes
  GET  /api/market/news?query=Apple+stock       → general finance news
  GET  /api/market/portfolio-news               → news for the user's investment holdings
  GET  /api/market/portfolio-quotes             → live prices for ALL user holdings (auto-detect market)
  GET  /api/market/search?q=apple               → search for stock symbols
"""

import os
import re
import logging
import urllib.parse
from datetime import datetime, timezone
from xml.etree import ElementTree

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict

from deps import db, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

# ── Timeout for all external requests ─────────────────────────────────────────
_TIMEOUT = 12


def _parse_number(v) -> Optional[float]:
    """Parse a Yahoo Finance numeric field that might be a dict or raw number."""
    if v is None:
        return None
    if isinstance(v, dict):
        v = v.get("raw") or v.get("fmt")
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        v = v.replace(",", "").replace("%", "")
        try:
            return float(v)
        except ValueError:
            return None
    return None


def _fetch_yahoo_quote(symbol: str) -> Optional[dict]:
    """
    Fetch a stock quote from Yahoo Finance's v8 chart endpoint.
    No API key required — this is Yahoo's public charting API.
    """
    symbol = symbol.upper().strip()
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    params = {"range": "5d", "interval": "1d"}
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=_TIMEOUT)
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = resp.json()
        result = data.get("chart", {}).get("result", [])
        if not result:
            return None
        item = result[0]
        meta = item.get("meta", {}) or {}
        indicators = item.get("indicators", {}) or {}
        quote_arr = indicators.get("quote", [{}])
        quote_data = quote_arr[0] if quote_arr else {}

        price = meta.get("regularMarketPrice")
        prev_close = meta.get("chartPreviousClose") or meta.get("previousClose")
        vol_list = quote_data.get("volume") or []
        close_list = quote_data.get("close") or []

        # Calculate change from previous close
        change = None
        change_pct = None
        if price is not None and prev_close is not None:
            change = round(price - prev_close, 2)
            change_pct = round((change / prev_close) * 100, 2) if prev_close else 0

        # Extract day's high/low from the last few candles
        high_list = quote_data.get("high") or []
        low_list = quote_data.get("low") or []
        day_high = None
        day_low = None
        if high_list:
            valid_highs = [h for h in high_list if h is not None]
            if valid_highs:
                day_high = max(valid_highs[-2:]) if len(valid_highs) >= 2 else valid_highs[-1]
        if low_list:
            valid_lows = [l for l in low_list if l is not None]
            if valid_lows:
                day_low = min(valid_lows[-2:]) if len(valid_lows) >= 2 else valid_lows[-1]

        # 52-week range from the full 5d data (approximate — not full year)
        year_low = None
        year_high = None
        if close_list:
            valid_closes = [c for c in close_list if c is not None]
            if valid_closes:
                year_low = min(valid_closes)
                year_high = max(valid_closes)

        volume = vol_list[-1] if vol_list else None

        return {
            "symbol": symbol,
            "name": meta.get("symbol", symbol),
            "exchange": meta.get("exchangeName", ""),
            "price": price,
            "previous_close": prev_close,
            "change": change,
            "change_percent": change_pct,
            "volume": volume,
            "day_low": day_low,
            "day_high": day_high,
            "year_low": year_low,
            "year_high": year_high,
            "currency": meta.get("currency", "USD"),
            "market_state": meta.get("marketState", ""),
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            return None
        logger.warning(f"Yahoo quote fetch failed for {symbol}: {e}")
        return None
    except Exception as e:
        logger.warning(f"Yahoo quote error for {symbol}: {e}")
        return None


# ── Quote endpoints ──────────────────────────────────────────────────────────

class QuoteResponse(BaseModel):
    symbol: str
    name: str = ""
    price: Optional[float] = None
    previous_close: Optional[float] = None
    change: Optional[float] = None
    change_percent: Optional[float] = None
    volume: Optional[float] = None
    day_low: Optional[float] = None
    day_high: Optional[float] = None
    year_low: Optional[float] = None
    year_high: Optional[float] = None
    currency: str = "USD"
    market_state: str = ""
    fetched_at: str = ""


@router.get("/market/quote")
async def market_quote(symbol: str = Query(..., description="Stock ticker symbol, e.g. AAPL")):
    """Get the latest price for a single stock symbol."""
    quote = _fetch_yahoo_quote(symbol)
    if not quote:
        raise HTTPException(status_code=404, detail=f"No data found for symbol '{symbol}'")
    return quote


@router.get("/market/quotes")
async def market_quotes(symbols: str = Query(..., description="Comma-separated symbols, e.g. AAPL,MSFT,GOOGL")):
    """Get latest prices for multiple stock symbols."""
    sym_list = [s.strip() for s in symbols.split(",") if s.strip()]
    if not sym_list:
        raise HTTPException(status_code=400, detail="No symbols provided")
    if len(sym_list) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 symbols per request")
    results = []
    for sym in sym_list:
        q = _fetch_yahoo_quote(sym)
        if q:
            results.append(q)
        else:
            results.append({"symbol": sym.upper(), "error": "not found", "price": None})
    return {"quotes": results}


# ── Smart symbol resolution ────────────────────────────────────────────────────

# Known Indian stock suffixes for NSE/BSE on Yahoo Finance
# NSE stocks: suffix .NS, BSE stocks: suffix .BO
# Crypto: suffix -USD on Yahoo (e.g. BTC-USD, ETH-USD)

# Common US tickers that should NOT be treated as Indian
_US_TICKERS = {
    "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "TSLA", "NVDA", "JPM",
    "V", "JNJ", "WMT", "PG", "UNH", "HD", "DIS", "BAC", "MA", "PYPL",
    "NFLX", "ADBE", "CRM", "ORCL", "INTC", "AMD", "MU", "QCOM", "AVGO",
    "CSCO", "PEP", "KO", "XOM", "CVX", "PFE", "MRK", "T", "VZ",
    "SHOP", "SQ", "ROKU", "ZM", "DOCU", "SNAP", "SPOT", "UBER", "LYFT",
    "ABNB", "PLTR", "SNOW", "COIN", "HOOD", "DASH", "RBLX", "AFRM",
    "F", "GM", "BA", "GE", "CAT", "NKE", "SBUX", "COST", "TGT",
    "LOWE", "HD", "BKNG", "ABNB", "MCD", "YUM", "GS", "MS", "C",
    "BLK", "SCHW", "BX", "KKR", "SPGI", "MCO", "AXP", "FIS", "FISV",
    "GILD", "AMGN", "BIIB", "REGN", "VRTX", "MRNA", "BNTX", "SGEN",
    "TMO", "ABT", "LLY", "DHR", "BMY", "AstraZeneca".upper(),
}

# Indian company name → likely NSE ticker mapping (common ones)
_INDIAN_NAME_HINTS = {
    "reliance": "RELIANCE", "tata": "TATAMOTORS", "infosys": "INFY",
    "icici": "ICICIBANK", "hdfc": "HDFCBANK", "sbi": "SBIN", "wipro": "WIPRO",
    "tata steel": "TATASTEEL", "tata motors": "TATAMOTORS", "tata power": "TATAPOWER",
    "larsen": "LT", "l&t": "LT", "kotak": "KOTAKBANK", "axis": "AXISBANK",
    "maruti": "MARUTI", "bajaj": "BAJFINANCE", "asian": "ASIANPAINT",
    "adani": "ADANIENT", "tcs": "TCS", "tech mahindra": "TECHM",
    "bharti": "BHARTIARTL", "ongc": "ONGC", "nifty": "^NSEI", "sensex": "^BSESN",
    "sun pharma": "SUNPHARMA", "cipla": "CIPLA", "dr reddy": "DRREDDY",
    "hindustan": "HINDUNILVR", "nestle": "NESTLEIND", "ultratech": "ULTRACEMCO",
    " Coal": "COALINDIA", "ntpc": "NTPC", "power grid": "POWERGRID",
    "indian oil": "IOC", "oil & gas": "GAIL", "gail": "GAIL",
    "zeel": "ZEEL", "zomato": "ZOMATO", "nykaa": "NYKAA", "paytm": "PAYTM",
    "pb fintech": "POLICYBZR", "policybazaar": "POLICYBZR",
    "jsw": "JSWSTEEL", "tata consumer": "TATACONSUM", "britannia": "BRITANNIA",
    "divis": "DIVISLAB", "pidilite": "PIDILITIND", "godrej": "GODREJCP",
    "dlf": "DLF", "oberoi": "OBEROIRLTY", "mahindra": "M&M",
    "hero": "HEROMOTOCO", "eicher": "EICHERMOT", "bajaj auto": "BAJAJ-AUTO",
    "bajaj finance": "BAJFINANCE", "bajaj finserv": "BAJAJFINSV",
    "hcl": "HCLTECH", "mindtree": "MINDTREE", "upt": "UPL",
}

# Crypto symbol mapping (Yahoo Finance uses -USD suffix)
_CRYPTO_SYMBOLS = {
    "bitcoin": "BTC-USD", "btc": "BTC-USD", "ethereum": "ETH-USD", "eth": "ETH-USD",
    "solana": "SOL-USD", "sol": "SOL-USD", "cardano": "ADA-USD", "ada": "ADA-USD",
    "dogecoin": "DOGE-USD", "doge": "DOGE-USD", "ripple": "XRP-USD", "xrp": "XRP-USD",
    "polkadot": "DOT-USD", "dot": "DOT-USD", "chainlink": "LINK-USD", "link": "LINK-USD",
    "litecoin": "LTC-USD", "ltc": "LTC-USD", "avalanche": "AVAX-USD", "avax": "AVAX-USD",
    "polygon": "MATIC-USD", "matic": "MATIC-USD", "tron": "TRX-USD", "trx": "TRX-USD",
    "shiba": "SHIB-USD", "shib": "SHIB-USD", "uniswap": "UNI-USD", "uni": "UNI-USD",
    "cosmos": "ATOM-USD", "atom": "ATOM-USD", "stellar": "XLM-USD", "xlm": "XLM-USD",
    "filecoin": "FIL-USD", "fil": "FIL-USD", "aptos": "APT-USD", "apt": "APT-USD",
    "arbitrum": "ARB-USD", "arb": "ARB-USD", "optimism": "OP-USD", "op": "OP-USD",
    "pepe": "PEPE-USD", "bonk": "BONK-USD", "wif": "WIF-USD", "floki": "FLOKI-USD",
    "bnb": "BNB-USD", "tether": "USDT-USD", "usdt": "USDT-USD",
    "usdc": "USDC-USD", "dai": "DAI-USD",
}

# Known exchanges by Yahoo suffix
_EXCHANGE_MAP = {
    ".NS": "NSE (National Stock Exchange of India)",
    ".BO": "BSE (Bombay Stock Exchange)",
    "-USD": "Crypto",
    "": "US Market",
}


def _resolve_symbol(name: str, asset_type: str = "", ticker_hint: str = "") -> List[str]:
    """
    Given an investment name, asset_type, and optional ticker hint,
    return a list of Yahoo Finance symbols to try (in order of likelihood).

    Handles:
    - US stocks (AAPL, MSFT, etc.)
    - Indian stocks (NSE: .NS suffix, BSE: .BO suffix)
    - Crypto (BTC-USD, ETH-USD, etc.)
    - Mutual funds / ETFs / other (try as-is)
    """
    name_lower = (name or "").lower().strip()
    ticker_hint = (ticker_hint or "").upper().strip()

    # If we have an explicit ticker hint, use it
    candidates = []

    # 1. Check if ticker_hint is already a Yahoo symbol (has .NS, .BO, -USD)
    if ticker_hint:
        if any(ticker_hint.endswith(s) for s in [".NS", ".BO", "-USD"]):
            candidates.append(ticker_hint)
        elif ticker_hint in _US_TICKERS:
            candidates.append(ticker_hint)
        elif ticker_hint.startswith("^"):
            candidates.append(ticker_hint)  # index like ^NSEI
        else:
            # Try as US first, then NSE
            candidates.append(ticker_hint)
            candidates.append(f"{ticker_hint}.NS")

    # 2. Check crypto mapping by name
    if asset_type == "crypto" or name_lower in _CRYPTO_SYMBOLS:
        crypto_sym = _CRYPTO_SYMBOLS.get(name_lower)
        if not crypto_sym and ticker_hint:
            # Try ticker as crypto
            crypto_sym = _CRYPTO_SYMBOLS.get(ticker_hint.lower())
        if not crypto_sym and ticker_hint:
            # Try appending -USD
            if not ticker_hint.endswith("-USD"):
                crypto_sym = f"{ticker_hint}-USD"
        if crypto_sym:
            candidates.insert(0, crypto_sym)

    # 3. Check Indian company name hints
    for hint, sym in _INDIAN_NAME_HINTS.items():
        if hint in name_lower:
            if sym.startswith("^"):
                candidates.append(sym)
            else:
                candidates.append(f"{sym}.NS")
                candidates.append(f"{sym}.BO")
            break

    # 4. Extract ticker from name patterns
    # Pattern: "Apple (AAPL)" → AAPL
    paren_match = re.search(r"\(([A-Z]{1,5}(?:-[A-Z]{3})?(?:\.[A-Z]{2})?)\)", name or "")
    if paren_match:
        t = paren_match.group(1).upper()
        if t not in candidates:
            candidates.append(t)
            if "." not in t and "-" not in t and not t.startswith("^"):
                candidates.append(f"{t}.NS")

    # Pattern: trailing all-caps word "Apple AAPL"
    trail_match = re.search(r"\s([A-Z]{2,5})$", name or "")
    if trail_match:
        t = trail_match.group(1).upper()
        if t not in candidates and t not in _US_TICKERS:
            candidates.append(f"{t}.NS")
            candidates.append(t)

    # Pattern: name IS a ticker "AAPL"
    if re.match(r"^[A-Z]{2,5}$", (name or "").upper()) and not name.startswith("^"):
        t = name.upper()
        if t in _US_TICKERS:
            candidates.insert(0, t)
        elif t not in candidates:
            candidates.insert(0, f"{t}.NS")
            candidates.insert(1, t)

    # 5. If no candidates found, try the name itself
    if not candidates and name:
        # Try as-is (works for some ETFs, mutual funds)
        candidates.append(name.upper())

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            unique.append(c)

    return unique[:5]  # max 5 attempts


def _fetch_quote_with_resolution(name: str, asset_type: str = "", ticker_hint: str = "") -> Optional[dict]:
    """
    Try to fetch a quote by resolving the investment name to the correct
    Yahoo Finance symbol. Returns the first successful quote with the
    resolved symbol info, or None.
    """
    symbols = _resolve_symbol(name, asset_type, ticker_hint)
    for sym in symbols:
        quote = _fetch_yahoo_quote(sym)
        if quote and quote.get("price") is not None:
            # Add resolution metadata
            quote["resolved_symbol"] = sym
            exchange = sym.split(".")[1] if "." in sym else ("Crypto" if "-USD" in sym else "US")
            quote["market"] = _EXCHANGE_MAP.get(f".{exchange}" if "." in sym else exchange, "US Market")
            if "-USD" in sym:
                quote["market"] = "Crypto"
            return quote
    return None


@router.get("/market/portfolio-quotes")
async def portfolio_quotes(user: dict = Depends(get_current_user)):
    """
    Fetch live prices for ALL of the user's investment holdings.
    Auto-detects the correct market (US, NSE, BSE, crypto) for each holding.
    Returns enriched data with exchange, currency, and live price.
    """
    investments = await db.investments.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)

    if not investments:
        return {"count": 0, "quotes": []}

    quotes = []
    for inv in investments:
        name = inv.get("name", "")
        asset_type = inv.get("asset_type", "stock")
        ticker = inv.get("ticker", "")
        inv_id = inv.get("investment_id", "")

        # Try to fetch a live quote
        q = _fetch_quote_with_resolution(name, asset_type, ticker)
        if q:
            quotes.append({
                "investment_id": inv_id,
                "name": name,
                "asset_type": asset_type,
                "ticker": q.get("resolved_symbol", ticker),
                "live_price": q.get("price"),
                "currency": q.get("currency", "USD"),
                "exchange": q.get("exchange", ""),
                "market": q.get("market", "US Market"),
                "market_state": q.get("market_state", ""),
                "change": q.get("change"),
                "change_percent": q.get("change_percent"),
                "previous_close": q.get("previous_close"),
                "day_low": q.get("day_low"),
                "day_high": q.get("day_high"),
                "volume": q.get("volume"),
                "fetched_at": q.get("fetched_at", ""),
                "stored_current_value": inv.get("current_value", 0),
                "amount_invested": inv.get("amount_invested", 0),
            })
        else:
            quotes.append({
                "investment_id": inv_id,
                "name": name,
                "asset_type": asset_type,
                "ticker": ticker or name,
                "live_price": None,
                "currency": "",
                "exchange": "",
                "market": "Unknown",
                "market_state": "",
                "change": None,
                "change_percent": None,
                "stored_current_value": inv.get("current_value", 0),
                "amount_invested": inv.get("amount_invested", 0),
                "error": "Could not resolve symbol",
            })

    return {"count": len(quotes), "quotes": quotes}


@router.get("/market/search")
async def market_search(q: str = Query(..., min_length=1, description="Search query")):
    """
    Search for stock/crypto symbols using Yahoo Finance's search API.
    Returns matching symbols with exchange info.
    """
    url = "https://query1.finance.yahoo.com/v1/finance/search"
    params = {"q": q, "quotesCount": 10, "newsCount": 0}
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        results = []
        for item in data.get("quotes", [])[:10]:
            results.append({
                "symbol": item.get("symbol", ""),
                "name": item.get("shortname", item.get("longname", "")),
                "exchange": item.get("exchange", ""),
                "type": item.get("quoteType", ""),
            })
        return {"query": q, "results": results}
    except Exception as e:
        logger.warning(f"Search failed for '{q}': {e}")
        return {"query": q, "results": []}


# ── News endpoints ────────────────────────────────────────────────────────────

def _fetch_google_news(query: str, limit: int = 10) -> List[dict]:
    """
    Fetch news articles from Google News RSS feed.
    No API key required — Google News exposes RSS feeds.
    """
    encoded = urllib.parse.quote_plus(query)
    url = f"https://news.google.com/rss/search?q={encoded}&hl=en-US&gl=US&ceid=US:en"
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
    try:
        resp = requests.get(url, headers=headers, timeout=_TIMEOUT)
        resp.raise_for_status()
        root = ElementTree.fromstring(resp.content)
        items = []
        for item in root.findall(".//item")[:limit]:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            pub_date = (item.findtext("pubDate") or "").strip()
            source_elem = item.find("source")
            source = source_elem.text if source_elem is not None else ""
            # Clean title — Google News format: "Title - Source"
            if " - " in title and source and title.endswith(source):
                title = title[: -len(source) - 3]
            items.append({
                "title": title,
                "link": link,
                "source": source,
                "published": pub_date,
                "summary": title,  # RSS doesn't give full body
            })
        return items
    except Exception as e:
        logger.warning(f"Google News fetch failed for '{query}': {e}")
        return []


@router.get("/market/news")
async def market_news(
    query: str = Query(..., description="Search query for news, e.g. 'Apple stock' or 'Tesla earnings'"),
    limit: int = Query(10, ge=1, le=30),
):
    """Get recent news articles for a given topic."""
    articles = _fetch_google_news(query, limit=limit)
    return {"query": query, "count": len(articles), "articles": articles}


@router.get("/market/portfolio-news")
async def portfolio_news(user: dict = Depends(get_current_user)):
    """
    Get news relevant to the user's investment portfolio.
    Fetches the user's investment holdings, builds search queries from the
    investment names, and aggregates news from Google News.
    """
    investments = await db.investments.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)

    if not investments:
        return {
            "count": 0,
            "articles": [],
            "holdings": [],
            "message": "No investments found. Add investments to get personalized news.",
        }

    # Build search queries — one per holding (max 8 to keep it fast)
    queries = []
    holdings_meta = []
    for inv in investments[:8]:
        name = inv.get("name", "")
        if not name:
            continue
        # Clean up the name for a news search — remove parenthetical ticker notes
        clean = re.sub(r"\s*\([^)]*\)", "", name).strip()
        if clean:
            queries.append(clean)
            holdings_meta.append({
                "name": name,
                "asset_type": inv.get("asset_type", ""),
                "current_value": inv.get("current_value", 0),
            })

    if not queries:
        return {"count": 0, "articles": [], "holdings": holdings_meta}

    # Fetch news for each holding (3 articles each, max 12 total)
    all_articles = []
    seen_links = set()
    for q in queries:
        articles = _fetch_google_news(q, limit=3)
        for a in articles:
            if a["link"] not in seen_links:
                seen_links.add(a["link"])
                a["query"] = q
                all_articles.append(a)
        if len(all_articles) >= 12:
            break

    return {
        "count": len(all_articles),
        "articles": all_articles[:12],
        "holdings": holdings_meta,
    }


# ── Chat context helper ──────────────────────────────────────────────────────

async def get_portfolio_market_context(user_id: str) -> str:
    """
    Build a market context string for the AI system prompt.
    Includes: current date/time, latest prices for the user's holdings,
    and recent news headlines.

    This is called from the chat message handler to give the AI real-time
    awareness of the user's portfolio and market conditions.
    """
    lines = [f"Current date & time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC (%A)')}"]

    # Get user's investments
    investments = await db.investments.find(
        {"user_id": user_id}, {"_id": 0, "name": 1, "asset_type": 1, "current_value": 1}
    ).to_list(20)

    if investments:
        quotes_lines = []
        news_lines = []
        fetched = 0
        for inv in investments[:5]:
            name = inv.get("name", "")
            if not name:
                continue
            # Extract an explicit ticker — prefer patterns like "(AAPL)" or "AAPL"
            # at the end of the name. Avoid matching common English words.
            ticker = None
            # Pattern 1: parenthetical ticker — "Apple (AAPL)" or "Apple Inc. (AAPL)"
            paren_match = re.search(r"\(([A-Z]{1,5})\)", name)
            if paren_match:
                ticker = paren_match.group(1)
            # Pattern 2: trailing all-caps word — "Apple AAPL"
            if not ticker:
                trail_match = re.search(r"\s([A-Z]{2,5})$", name)
                if trail_match:
                    ticker = trail_match.group(1)
            # Pattern 3: name IS a ticker — "AAPL"
            if not ticker and re.match(r"^[A-Z]{2,5}$", name):
                ticker = name

            if ticker and fetched < 5:
                quote = _fetch_yahoo_quote(ticker)
                if quote and quote.get("price") is not None:
                    quotes_lines.append(
                        f"  - {quote['name']} ({ticker}): ${quote['price']} "
                        f"({'+' if (quote.get('change_percent') or 0) >= 0 else ''}"
                        f"{quote.get('change_percent', 0):.2f}%) "
                        f"Vol: {quote.get('volume', 'N/A')}"
                    )
                    # Also fetch news for this holding
                    articles = _fetch_google_news(name, limit=2)
                    for a in articles:
                        news_lines.append(f"  - [{a['source']}] {a['title']}")
                    fetched += 1
                    continue
            # Fallback — fetch news by name, no live quote
            quotes_lines.append(f"  - {name} ({inv.get('asset_type', '')}) — value: ${inv.get('current_value', 0)}")
            # Always fetch news even if no ticker
            if fetched < 5:
                articles = _fetch_google_news(name, limit=2)
                for a in articles:
                    news_lines.append(f"  - [{a['source']}] {a['title']}")
                fetched += 1

        if quotes_lines:
            lines.append("\n=== PORTFOLIO MARKET DATA ===")
            lines.append("Latest prices for your holdings:")
            lines.extend(quotes_lines)

        if news_lines:
            lines.append("\nRecent news about your holdings:")
            lines.extend(news_lines)

        lines.append("=== END MARKET DATA ===")

    return "\n".join(lines)