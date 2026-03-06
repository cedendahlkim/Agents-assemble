// LAGER 2 — Agent B: Memory Agent — Gracestack AI (Port 10021)
// Gracestack Architecture: Ebbinghaus + HDC + Gut Feeling
// Now with SQLite-backed persistent memory across sessions

import "dotenv/config";
import express from "express";
import { PersistentMemoryStore, computeStrength } from "./persistence/ebbinghaus-store.js";
import { HdcEncoder, type MemoryEntry } from "./bride/hdc.js";
import { GutFeeling } from "./bride/gut-feeling.js";

const PORT = parseInt(process.env.MEMORY_AGENT_PORT ?? "10021", 10);

const store = new PersistentMemoryStore();
const hdc = new HdcEncoder();
const gut = new GutFeeling();

const app = express();
app.use(express.json());

// --- Agent Card (A2A discovery) ---
app.get("/.well-known/agent-card.json", (_req, res) => {
  res.json({
    name: "Memory Agent (Gracestack AI)",
    description:
      "Ebbinghaus-based patient memory with HDC pattern matching and Gut Feeling anomaly detection. Powered by Gracestack AI.",
    protocolVersion: "0.3.0",
    version: "1.0.0",
    url: `http://localhost:${PORT}`,
    skills: [
      {
        id: "patient-memory",
        name: "Patient Memory",
        description: "Retrieve patient memories with Ebbinghaus decay-weighted relevance",
        tags: ["memory", "ebbinghaus", "patient"],
      },
      {
        id: "pattern-detection",
        name: "Pattern Detection",
        description: "HDC-based fuzzy matching of symptom patterns across patient history",
        tags: ["hdc", "patterns", "symptoms"],
      },
      {
        id: "gut-feeling",
        name: "Gut Feeling",
        description: "Anomaly detection flagging unusual combinations with confidence scores",
        tags: ["anomaly", "gut-feeling", "safety"],
      },
    ],
    capabilities: { pushNotifications: false },
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
  });
});

// --- Query endpoint ---
interface QueryRequest {
  patient_id: string;
  query_type: "history" | "patterns" | "gut_feeling";
  context?: string;
}

app.post("/a2a/query", (req, res) => {
  const body = req.body as QueryRequest;
  const { patient_id, query_type, context = "" } = body;

  // Get memories with Ebbinghaus decay (now persistent via SQLite)
  const rawMemories = store.getMemories(patient_id);
  const encounterCount = store.getEncounterCount(patient_id);
  const memories: MemoryEntry[] = rawMemories.map((m) => ({
    content: m.content,
    strength: computeStrength(m.last_accessed, m.stability),
    lastAccessed: new Date(m.last_accessed).toISOString(),
    category: m.category as MemoryEntry["category"],
  }));

  // HDC pattern detection
  const patterns =
    query_type === "patterns" || query_type === "history"
      ? hdc.findPatterns(memories, context)
      : [];

  // Gut feeling anomaly detection
  const gut_feeling_flags =
    query_type === "gut_feeling" || query_type === "history"
      ? gut.analyze(
          memories.map((m) => ({ content: m.content, strength: m.strength, category: m.category })),
          context,
        )
      : [];

  // Reinforce accessed memories
  store.reinforceMemories(patient_id);

  res.json({
    patient_id,
    memories,
    patterns,
    gut_feeling_flags,
    encounter_count: encounterCount,
    persistence: "sqlite",
  });
});

// --- Ingest endpoint ---
interface IngestRequest {
  patient_id: string;
  content: string;
  category: "condition" | "medication" | "observation" | "procedure";
  triage_level?: string;
  fhir_observation_id?: string;
}

app.post("/a2a/ingest", (req, res) => {
  const body = req.body as IngestRequest;
  const memoryId = store.addMemory(body.patient_id, body.content, body.category, {
    triageLevel: body.triage_level,
    fhirObservationId: body.fhir_observation_id,
  });
  hdc.encodeMemory(body.content, body.category);

  res.json({ status: "stored", memory_id: memoryId, persistence: "sqlite" });
});

// --- Encounter logging ---
app.post("/a2a/encounter", (req, res) => {
  const { patient_id, query, triage_level, agents_used, summary } = req.body;
  const encounterId = store.logEncounter(patient_id, query, { triageLevel: triage_level, agentsUsed: agents_used, summary });
  res.json({ status: "logged", encounter_id: encounterId });
});

app.get("/a2a/encounters/:patientId", (req, res) => {
  const encounters = store.getEncounters(req.params.patientId);
  res.json({ patient_id: req.params.patientId, encounters, count: encounters.length });
});

// --- Health check ---
app.get("/health", (_req, res) => {
  res.json({ status: "ok", agent: "memory-gracestack", port: PORT, persistence: "sqlite" });
});

app.listen(PORT, () => {
  console.log(`🧠 Memory Agent (Gracestack AI) running on http://localhost:${PORT}`);
  console.log(`   Gracestack modules: Ebbinghaus | HDC (${10_000}d) | Gut Feeling`);
  console.log(`   💾 Persistent memory: SQLite`);
});
