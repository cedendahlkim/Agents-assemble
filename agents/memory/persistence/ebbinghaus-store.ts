// Persistent Ebbinghaus Memory Store — SQLite-backed
// Survives restarts, enabling cross-session patient memory recall

import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = process.env.MEMORY_DB_PATH ?? join(__dirname, "..", "data", "patient_memory.db");

const BASE_STABILITY = 72;
const REINFORCEMENT_FACTOR = 1.5;
const CRITICAL_BONUS = 2.0;
const DECAY_THRESHOLD = 0.05;

export interface PersistedMemory {
  id: string;
  patient_id: string;
  content: string;
  category: "condition" | "medication" | "observation" | "procedure";
  created_at: number;
  last_accessed: number;
  stability: number;
  access_count: number;
  encounter_date: string;
  triage_level: string | null;
  hdc_vector: string | null;
  gut_feeling_flags: string | null;
  fhir_observation_id: string | null;
}

function isCriticalCategory(category: string): boolean {
  return category === "condition" || category === "procedure";
}

export function computeStrength(lastAccessed: number, stability: number): number {
  const hoursElapsed = (Date.now() - lastAccessed) / (1000 * 60 * 60);
  const retention = Math.exp(-hoursElapsed / stability);
  return Math.max(0, Math.min(1, retention));
}

export class PersistentMemoryStore {
  private db: Database.Database;

  constructor() {
    // Ensure data directory exists
    const { mkdirSync } = require("fs");
    mkdirSync(dirname(DB_PATH), { recursive: true });

    this.db = new Database(DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
    this.seedIfEmpty();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS patient_memory (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_accessed INTEGER NOT NULL,
        stability REAL NOT NULL,
        access_count INTEGER DEFAULT 0,
        encounter_date TEXT NOT NULL,
        triage_level TEXT,
        hdc_vector TEXT,
        gut_feeling_flags TEXT,
        fhir_observation_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_patient_id ON patient_memory(patient_id);
      CREATE INDEX IF NOT EXISTS idx_encounter_date ON patient_memory(encounter_date);

      CREATE TABLE IF NOT EXISTS encounter_log (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        query TEXT NOT NULL,
        triage_level TEXT,
        agents_used TEXT,
        summary TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_encounter_patient ON encounter_log(patient_id);
    `);
  }

  addMemory(
    patientId: string,
    content: string,
    category: PersistedMemory["category"],
    opts?: { triageLevel?: string; fhirObservationId?: string },
  ): string {
    const id = randomUUID();
    const now = Date.now();
    const stability = isCriticalCategory(category)
      ? BASE_STABILITY * CRITICAL_BONUS
      : BASE_STABILITY;

    this.db.prepare(`
      INSERT INTO patient_memory (id, patient_id, content, category, created_at, last_accessed, stability, access_count, encounter_date, triage_level, fhir_observation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(id, patientId, content, category, now, now, stability, new Date().toISOString(), opts?.triageLevel ?? null, opts?.fhirObservationId ?? null);

    return id;
  }

  getMemories(patientId: string): PersistedMemory[] {
    const rows = this.db.prepare(`
      SELECT * FROM patient_memory WHERE patient_id = ? ORDER BY last_accessed DESC
    `).all(patientId) as PersistedMemory[];

    return rows.filter(
      (m) => computeStrength(m.last_accessed, m.stability) >= DECAY_THRESHOLD,
    );
  }

  reinforceMemories(patientId: string): void {
    const now = Date.now();
    this.db.prepare(`
      UPDATE patient_memory
      SET last_accessed = ?,
          access_count = access_count + 1,
          stability = stability * ?
      WHERE patient_id = ?
    `).run(now, REINFORCEMENT_FACTOR, patientId);
  }

  logEncounter(
    patientId: string,
    query: string,
    opts?: { triageLevel?: string; agentsUsed?: string[]; summary?: string },
  ): string {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO encounter_log (id, patient_id, timestamp, query, triage_level, agents_used, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, patientId, new Date().toISOString(), query, opts?.triageLevel ?? null, JSON.stringify(opts?.agentsUsed ?? []), opts?.summary ?? null);
    return id;
  }

  getEncounters(patientId: string): Array<{ id: string; timestamp: string; query: string; triage_level: string | null; summary: string | null }> {
    return this.db.prepare(`
      SELECT id, timestamp, query, triage_level, summary FROM encounter_log
      WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 20
    `).all(patientId) as Array<{ id: string; timestamp: string; query: string; triage_level: string | null; summary: string | null }>;
  }

  getEncounterCount(patientId: string): number {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM encounter_log WHERE patient_id = ?`).get(patientId) as { count: number };
    return row.count;
  }

  private seedIfEmpty(): void {
    const count = (this.db.prepare("SELECT COUNT(*) as c FROM patient_memory").get() as { c: number }).c;
    if (count > 0) return;

    const pid = "sven-eriksson";
    const seeds: Array<[string, PersistedMemory["category"]]> = [
      ["Myocardial infarction (STEMI) treated with PCI — March 2023", "condition"],
      ["Hypertension diagnosed — ongoing since 2019, managed with Losartan 50mg", "condition"],
      ["Aspirin 75mg daily — prescribed post-MI 2023", "medication"],
      ["Atorvastatin 40mg daily — cholesterol management", "medication"],
      ["Metoprolol 50mg x2 — beta blocker post-MI", "medication"],
      ["Follow-up echocardiogram — EF 45%, mild LV dysfunction — June 2023", "observation"],
      ["Reported intermittent dizziness during exercise — September 2024", "observation"],
      ["Blood pressure well controlled at 130/82 — last visit January 2025", "observation"],
    ];

    for (const [content, category] of seeds) {
      this.addMemory(pid, content, category);
    }
    this.reinforceMemories(pid);
    this.reinforceMemories(pid);

    console.log(`💾 Seeded ${seeds.length} memories for demo patient ${pid}`);
  }
}
