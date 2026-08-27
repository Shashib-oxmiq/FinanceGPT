// ── Web Search Service ────────────────────────────────────────────────────────
// Provides real-time web search for the AI chat. Uses DuckDuckGo Instant Answer
// API (no key needed) + HTML scrape fallback. Results include titles, snippets,
// and source URLs. On mobile, routes through the backend proxy to avoid CORS.
// On web, uses the backend proxy too (DuckDuckGo blocks direct browser fetches).

import { CONFIG } from "../config";
import { Platform } from "react-native";

const BACKEND_URL = CONFIG.BACKEND_URL;

// ── Main search function ──
export async function webSearch(query, options = {}) {
  const { maxResults = 5, safeSearch = "moderate" } = options;
  
  try {
    // Route through backend proxy to avoid CORS on both web and mobile
    const url = `${BACKEND_URL}/api/web/search`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, max_results: maxResults, safe_search: safeSearch }),
    });
    if (!res.ok) throw new Error(`Search failed (${res.status})`);
    const data = await res.json();
    return data.results || [];
  } catch (e) {
    console.warn("Web search failed:", e.message);
    // Fallback: try DuckDuckGo Instant Answer API directly (works on native, may fail on web due to CORS)
    return await duckDuckGoFallback(query, maxResults);
  }
}

// ── DuckDuckGo Instant Answer API fallback (no key needed) ──
async function duckDuckGoFallback(query, maxResults) {
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1&skip_disambig=1`;
    const res = await fetch(ddgUrl);
    if (!res.ok) return [];
    const data = await res.json();
    const results = [];
    
    // Abstract (main answer)
    if (data.AbstractText) {
      results.push({
        title: data.Heading || query,
        snippet: data.AbstractText,
        url: data.AbstractURL || "",
        source: data.AbstractSource || "DuckDuckGo",
      });
    }
    
    // Related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(" - ")[0] || topic.Text.substring(0, 80),
            snippet: topic.Text,
            url: topic.FirstURL,
            source: "DuckDuckGo",
          });
        }
      }
    }
    
    return results.slice(0, maxResults);
  } catch (e) {
    console.warn("DuckDuckGo fallback failed:", e.message);
    return [];
  }
}

// ── Search and format for AI context ──
export async function searchForAI(query) {
  const results = await webSearch(query, { maxResults: 5 });
  if (results.length === 0) {
    return `[WEB_SEARCH_RESULT: No results found for "${query}"]`;
  }
  const formatted = results.map((r, i) => 
    `[${i + 1}] ${r.title}\n    ${r.snippet}\n    Source: ${r.url}`
  ).join("\n\n");
  return `[WEB_SEARCH_RESULT for "${query}":\n${formatted}\n]`;
}

// ── Search for financial data (stock prices, news, tax rules) ──
export async function searchFinancial(query) {
  const results = await webSearch(`India finance ${query}`, { maxResults: 5 });
  return results;
}

// ── Search latest news ──
export async function searchNews(query) {
  const results = await webSearch(`${query} latest news India 2025`, { maxResults: 5 });
  return results;
}

// ── Detect if a user query needs web search ──
export function needsWebSearch(text) {
  const lower = text.toLowerCase();
  const triggers = [
    "latest", "current", "today", "now", "recent", "news",
    "price of", "rate of", "what is the price",
    "stock", "share price", "market",
    "tax rule", "tax slab", "tax rate",
    "government scheme", "govt scheme",
    "interest rate", "fd rate", "loan rate",
    "inflation", "gdp", "budget 2025", "budget 2026",
    "update on", "happened with", "status of",
    "compare", "best", "top",
    "rule for", "law for", "regulation",
  ];
  return triggers.some(t => lower.includes(t));
}