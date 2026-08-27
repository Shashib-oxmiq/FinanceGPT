// ── Health Score Trend Service (F-217) ──────────────────────────────────────
// Stores weekly health score snapshots and computes trend over time.

import { dbAll, dbRun, uuid } from "./db";
import { computeHealthScore } from "./healthScore";

export async function recordSnapshot(userId) {
  const hs = await computeHealthScore(userId);
  const id = uuid();
  await dbRun("INSERT INTO health_score_history (snapshot_id, user_id, score, breakdown) VALUES (?, ?, ?, ?)",
    [id, userId, hs.score, JSON.stringify(hs.breakdown || {})]);
  return hs;
}

export async function getHistory(userId, weeks = 12) {
  const rows = await dbAll("SELECT * FROM health_score_history WHERE user_id = ? ORDER BY recorded_at DESC LIMIT ?", [userId, weeks]) || [];
  return rows.reverse(); // chronological order
}

export async function getTrend(userId) {
  const history = await getHistory(userId, 12);
  if (history.length < 2) return { trend: "stable", change: 0, history };

  const latest = history[history.length - 1].score;
  const previous = history[history.length - 2].score;
  const change = latest - previous;

  // Calculate overall direction over last 4 snapshots
  const recent = history.slice(-4);
  let increasing = 0, decreasing = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].score > recent[i-1].score) increasing++;
    else if (recent[i].score < recent[i-1].score) decreasing++;
  }

  const trend = increasing > decreasing ? "improving" : decreasing > increasing ? "declining" : "stable";

  return { trend, change, latest, history, improving: increasing, declining: decreasing };
}

// ── Auto-record if last snapshot > 7 days ago ──
export async function maybeRecordSnapshot(userId) {
  const history = await getHistory(userId, 1);
  if (history.length === 0) return recordSnapshot(userId);

  const last = new Date(history[0].recorded_at);
  const daysSince = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince >= 7) return recordSnapshot(userId);
  return null;
}