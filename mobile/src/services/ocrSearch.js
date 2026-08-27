// ── OCR Text Search Service (F-218) ──────────────────────────────────────────
// Search inside uploaded documents by extracting text content.
// On web: uses browser FileReader to read text-based uploads (txt, csv, json).
// On native: would use expo-document-picker + text extraction.
// For PDFs/images: delegates to backend OCR (when available) or AI vision.

import { api } from "./api";
import { Platform } from "react-native";

// ── Search across all vault documents ──
export async function searchVaultDocuments(userId, query) {
  if (!query || query.trim().length < 2) return [];

  let documents = [];
  try { documents = await api.getDocuments(userId); } catch { /* */ }

  const q = query.toLowerCase();
  const results = [];

  for (const doc of documents) {
    let matched = false;
    let matchContext = "";
    const score = { total: 0, fields: [] };

    // Search filename
    const filename = (doc.original_filename || "").toLowerCase();
    if (filename.includes(q)) {
      matched = true;
      score.total += 3;
      score.fields.push("filename");
      matchContext = `Filename: "${doc.original_filename}"`;
    }

    // Search category
    const category = (doc.category || "").toLowerCase();
    if (category.includes(q)) {
      matched = true;
      score.total += 2;
      score.fields.push("category");
    }

    // Search content type
    const contentType = (doc.content_type || "").toLowerCase();
    if (contentType.includes(q)) {
      matched = true;
      score.total += 1;
      score.fields.push("type");
    }

    // Search metadata/notes
    const metadata = (doc.metadata || doc.notes || "").toLowerCase();
    if (metadata.includes(q)) {
      matched = true;
      score.total += 2;
      score.fields.push("metadata");
      // Extract surrounding context
      const idx = metadata.indexOf(q);
      const start = Math.max(0, idx - 30);
      const end = Math.min(metadata.length, idx + q.length + 30);
      matchContext = `...${metadata.substring(start, end)}...`;
    }

    // Search extracted text (if available from OCR)
    const extractedText = (doc.extracted_text || "").toLowerCase();
    if (extractedText.includes(q)) {
      matched = true;
      score.total += 5; // highest weight — actual content match
      score.fields.push("content");
      const idx = extractedText.indexOf(q);
      const start = Math.max(0, idx - 40);
      const end = Math.min(extractedText.length, idx + q.length + 40);
      matchContext = `Content: ...${extractedText.substring(start, end)}...`;
    }

    if (matched) {
      results.push({ ...doc, score: score.total, matchFields: score.fields, matchContext });
    }
  }

  // Sort by relevance score
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ── Extract text from a document (web only — reads file content) ──
export async function extractTextFromDocument(doc) {
  if (Platform.OS !== "web") return null;

  const contentType = doc.content_type || "";
  const uri = doc.uri || doc.file_uri;

  // Only extract from text-based files
  if (contentType.includes("text") || contentType.includes("json") || contentType.includes("csv") ||
      (doc.original_filename || "").match(/\.(txt|csv|json|md)$/i)) {
    try {
      if (uri && typeof fetch === "function") {
        const resp = await fetch(uri);
        const text = await resp.text();
        return text.substring(0, 5000); // cap at 5K chars
      }
    } catch { /* */ }
  }

  // For PDFs and images: would need OCR backend or AI vision
  // Return null — the AI can still describe the document from its filename/metadata
  return null;
}

// ── Full-text index of all documents ──
export async function indexAllDocuments(userId) {
  let documents = [];
  try { documents = await api.getDocuments(userId); } catch { /* */ }

  const index = [];
  for (const doc of documents) {
    const text = await extractTextFromDocument(doc);
    index.push({
      id: doc.document_id,
      filename: doc.original_filename,
      category: doc.category,
      extractedText: text || "",
      indexed_at: new Date().toISOString(),
    });
  }
  return index;
}