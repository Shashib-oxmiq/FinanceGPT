// ── Medical Records Timeline Service ──────────────────────────────────────────
// Stores prescriptions, lab reports, vaccination records, diagnoses.
// Creates a chronological health timeline — no more lost prescriptions.

import { dbAll, dbRun, uuid } from "./db";

export async function getMedicalRecords(userId) {
  const rows = await dbAll("SELECT * FROM medical_records WHERE user_id = ? ORDER BY date DESC, created_at DESC", [userId]);
  return rows || [];
}

export async function createMedicalRecord(userId, { type, title, doctor, hospital, date, diagnosis, prescription, notes, attachments }) {
  const id = uuid();
  await dbRun(
    "INSERT INTO medical_records (record_id, user_id, type, title, doctor, hospital, date, diagnosis, prescription, notes, attachments) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, userId, type || "consultation", title || "", doctor || "", hospital || "", date || new Date().toISOString().split("T")[0], diagnosis || "", prescription || "", notes || "", JSON.stringify(attachments || [])]
  );
  return { record_id: id, type, title, doctor, hospital, date, diagnosis, prescription, notes };
}

export async function deleteMedicalRecord(recordId) {
  await dbRun("DELETE FROM medical_records WHERE record_id = ?", [recordId]);
}

// ── Medical record types ──
export const RECORD_TYPES = [
  { key: "consultation", label: "Doctor Consultation", icon: "person" },
  { key: "prescription", label: "Prescription", icon: "document-text" },
  { key: "lab_report", label: "Lab Report", icon: "flask" },
  { key: "vaccination", label: "Vaccination", icon: "syringe" },
  { key: "diagnosis", label: "Diagnosis", icon: "medical" },
  { key: "surgery", label: "Surgery/Procedure", icon: "cut" },
  { key: "allergy", label: "Allergy Record", icon: "warning" },
  { key: "scan", label: "Scan/X-Ray/MRI", icon: "scan" },
];

// ── Emergency medical info (for lock screen / emergency) ──
export async function getEmergencyMedicalInfo(userId) {
  const records = await getMedicalRecords(userId);
  const allergies = records.filter(r => r.type === "allergy").map(r => r.diagnosis || r.title);
  const chronicConditions = records.filter(r => r.type === "diagnosis" && r.notes && r.notes.toLowerCase().includes("chronic")).map(r => r.diagnosis || r.title);
  const medications = records.filter(r => r.type === "prescription").slice(-5).map(r => r.prescription).filter(Boolean);
  const vaccinations = records.filter(r => r.type === "vaccination").map(r => r.title);

  return {
    bloodGroup: await getBloodGroup(userId),
    allergies: [...new Set(allergies)],
    chronicConditions: [...new Set(chronicConditions)],
    currentMedications: [...new Set(medications)],
    vaccinations,
    emergencyContacts: [], // Would come from trusted contacts
  };
}

async function getBloodGroup(userId) {
  // Check if user has a blood group record
  const records = await getMedicalRecords(userId);
  const bgRecord = records.find(r => r.title?.toLowerCase().includes("blood") || r.diagnosis?.toLowerCase().includes("blood group"));
  return bgRecord?.diagnosis || bgRecord?.notes || "Unknown";
}

// ── Health timeline summary ──
export async function getHealthTimeline(userId) {
  const records = await getMedicalRecords(userId);
  const byYear = {};
  for (const r of records) {
    const year = (r.date || "").substring(0, 4);
    if (year) {
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(r);
    }
  }
  return { records, byYear, total: records.length };
}