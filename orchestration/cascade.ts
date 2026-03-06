// LAGER 3 — Orchestration Agent (Cascade Remote)
// Takes natural language input, discovers agents via A2A, delegates tasks, synthesizes responses.
// Uses Gemini as LLM backbone for intent parsing and response generation.

import "dotenv/config";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  TriageResult,
  MemoryResult,
  FhirPatientSummary,
  OrchestrationRequest,
  OrchestrationResponse,
} from "../shared/types.js";
import { safeParseJson } from "../shared/llm-utils.js";

import cors from "cors";

const PORT = parseInt(process.env.ORCHESTRATION_PORT ?? "10030", 10);

const TRIAGE_AGENT_URL = process.env.TRIAGE_AGENT_URL ?? "http://localhost:10020";
const MEMORY_AGENT_URL = process.env.MEMORY_AGENT_URL ?? "http://localhost:10021";
const FHIR_AGENT_URL = process.env.FHIR_AGENT_URL ?? "http://localhost:10028";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// --- Intent Analysis ---

interface Intent {
  needsTriage: boolean;
  needsMemory: boolean;
  needsFhir: boolean;
  patientId: string | null;
  patientName: string | null;
  symptoms: string | null;
  rawQuery: string;
}

const INTENT_SYSTEM_PROMPT = `You are an intent parser for a healthcare multi-agent system.
Given a user message, determine which agents need to be involved.

Available agents:
1. Triage Agent — Assess urgency of symptoms (needs: symptoms description)
2. Memory Agent — Retrieve patient history, patterns, anomaly detection (needs: patient identifier)
3. FHIR Agent — Fetch/write patient journal data (needs: patient identifier)

Respond ONLY with valid JSON:
{
  "needsTriage": boolean,
  "needsMemory": boolean,
  "needsFhir": boolean,
  "patientId": string | null,
  "patientName": string | null,
  "symptoms": string | null
}

Rules:
- If symptoms are mentioned, needsTriage = true
- If patient history/memory/patterns are relevant, needsMemory = true
- If journal data is needed or should be written, needsFhir = true
- Extract patient name and map to known IDs (e.g., "Sven Eriksson" -> "sven-eriksson")
- If no specific patient, set patientId to null`;

// Deterministic patient name → ID mapping (supplements LLM parsing)
const KNOWN_PATIENTS: Record<string, string> = {
  "sven eriksson": "sven-eriksson",
  "sven": "sven-eriksson",
  "eriksson": "sven-eriksson",
};

function resolvePatientId(name: string | null, rawMessage: string): string | null {
  // Try LLM-provided name first
  if (name) {
    const normalized = name.toLowerCase().trim();
    if (KNOWN_PATIENTS[normalized]) return KNOWN_PATIENTS[normalized];
    // Convert "First Last" → "first-last" as fallback
    return normalized.replace(/\s+/g, "-");
  }
  // Scan raw message for known patient names
  const lower = rawMessage.toLowerCase();
  for (const [pattern, id] of Object.entries(KNOWN_PATIENTS)) {
    if (lower.includes(pattern)) return id;
  }
  return null;
}

async function analyzeIntent(userMessage: string): Promise<Intent> {
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    systemInstruction: { role: "system", parts: [{ text: INTENT_SYSTEM_PROMPT }] },
    generationConfig: { maxOutputTokens: 512 },
  });

  const text = result.response.text();
  const fallback = {
    needsTriage: true,
    needsMemory: true,
    needsFhir: false,
    patientId: null,
    patientName: null,
    symptoms: userMessage,
  };
  const parsed = safeParseJson(text, fallback);
  const intent: Intent = { ...parsed, rawQuery: userMessage };

  // Post-process: resolve patientId deterministically
  intent.patientId = resolvePatientId(intent.patientName ?? intent.patientId, userMessage);

  // If we have a patient, always check memory (our killer feature)
  if (intent.patientId) {
    intent.needsMemory = true;
  }

  return intent;
}

// --- Agent Communication ---

async function callTriageAgent(symptoms: string, patientId?: string): Promise<TriageResult | null> {
  try {
    const body = {
      jsonrpc: "2.0",
      id: uuidv4(),
      method: "message/send",
      params: {
        message: {
          messageId: uuidv4(),
          role: "user",
          kind: "message",
          parts: [{
            kind: "text",
            text: patientId ? `patientId:${patientId} ${symptoms}` : symptoms,
          }],
        },
      },
    };

    const response = await fetch(`${TRIAGE_AGENT_URL}/a2a/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json() as { result?: { parts?: Array<{ text?: string }> } };
    const resultText = data.result?.parts?.[0]?.text;
    if (resultText) {
      return JSON.parse(resultText) as TriageResult;
    }
  } catch (err) {
    console.error("Triage agent call failed:", err);
  }
  return null;
}

async function callMemoryAgent(patientId: string, queryType: string, context?: string): Promise<MemoryResult | null> {
  try {
    const response = await fetch(`${MEMORY_AGENT_URL}/a2a/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_id: patientId,
        query_type: queryType,
        context,
      }),
    });

    const data = await response.json() as {
      patient_id: string;
      memories: Array<{ content: string; strength: number; last_accessed: string; category: string }>;
      patterns: string[];
      gut_feeling_flags: Array<{ description: string; confidence: number; related_memories: string[] }>;
    };

    return {
      patientId: data.patient_id,
      memories: data.memories.map((m) => ({
        content: m.content,
        strength: m.strength,
        lastAccessed: m.last_accessed,
        category: m.category as "condition" | "medication" | "observation" | "procedure",
      })),
      patterns: data.patterns,
      gutFeelingFlags: data.gut_feeling_flags.map((f) => ({
        description: f.description,
        confidence: f.confidence,
        relatedMemories: f.related_memories,
      })),
    };
  } catch (err) {
    console.error("Memory agent call failed:", err);
  }
  return null;
}

async function callFhirAgent(patientId: string, action: string): Promise<FhirPatientSummary | null> {
  try {
    const body = {
      jsonrpc: "2.0",
      id: uuidv4(),
      method: "message/send",
      params: {
        message: {
          messageId: uuidv4(),
          role: "user",
          kind: "message",
          parts: [{ kind: "text", text: JSON.stringify({ action, patientId }) }],
        },
      },
    };

    const response = await fetch(`${FHIR_AGENT_URL}/a2a/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json() as { result?: { parts?: Array<{ text?: string }> } };
    const resultText = data.result?.parts?.[0]?.text;
    if (resultText) {
      return JSON.parse(resultText) as FhirPatientSummary;
    }
  } catch (err) {
    console.error("FHIR agent call failed:", err);
  }
  return null;
}

// --- Response Synthesis ---

const SYNTHESIS_SYSTEM_PROMPT = `You are a healthcare orchestration assistant. 
Synthesize the results from multiple specialized agents into a clear, actionable clinical summary.
Be concise but thorough. Highlight critical findings prominently.
Always mention if gut feeling flags were raised.
Respond in the same language as the user's query.`;

async function synthesizeResponse(
  intent: Intent,
  triageResult: TriageResult | null,
  memoryResult: MemoryResult | null,
  fhirData: FhirPatientSummary | null,
): Promise<string> {
  const agentResults: string[] = [];

  if (triageResult) {
    agentResults.push(`TRIAGE RESULT:\nPriority: ${triageResult.priority}\nReasoning: ${triageResult.reasoning}`);
  }
  if (memoryResult) {
    const memSummary = memoryResult.memories
      .slice(0, 5)
      .map((m) => `- [${m.category}, strength=${m.strength.toFixed(2)}] ${m.content}`)
      .join("\n");
    const patternSummary = memoryResult.patterns.join("\n");
    const gutFlags = memoryResult.gutFeelingFlags
      .map((f) => `- ${f.description} (confidence: ${(f.confidence * 100).toFixed(0)}%)`)
      .join("\n");
    agentResults.push(
      `MEMORY AGENT RESULT:\nKey Memories:\n${memSummary}\n\nPatterns:\n${patternSummary}\n\nGut Feeling Flags:\n${gutFlags || "None"}`,
    );
  }
  if (fhirData) {
    agentResults.push(
      `FHIR JOURNAL DATA:\nPatient: ${fhirData.name} (${fhirData.id})\nConditions: ${fhirData.conditions.join(", ")}\nMedications: ${fhirData.medications.join(", ")}\nRecent Observations: ${fhirData.recentObservations.join(", ")}`,
    );
  }

  const result = await model.generateContent({
    contents: [{
      role: "user",
      parts: [{ text: `Original query: "${intent.rawQuery}"\n\nAgent results:\n${agentResults.join("\n\n---\n\n")}\n\nPlease synthesize a clinical summary.` }],
    }],
    systemInstruction: { role: "system", parts: [{ text: SYNTHESIS_SYSTEM_PROMPT }] },
    generationConfig: { maxOutputTokens: 1024 },
  });

  return result.response.text() || "Unable to synthesize response.";
}

// --- Main Orchestration Endpoint ---

async function orchestrate(req: OrchestrationRequest): Promise<OrchestrationResponse> {
  console.log(`\n📨 New request: "${req.userMessage}"`);

  // Step 1: Analyze intent
  const intent = await analyzeIntent(req.userMessage);
  console.log("🎯 Intent:", JSON.stringify(intent, null, 2));

  const agentsUsed: string[] = [];
  let triageResult: TriageResult | null = null;
  let memoryResult: MemoryResult | null = null;
  let fhirData: FhirPatientSummary | null = null;

  // Step 2: Parallel agent calls based on intent
  const promises: Promise<void>[] = [];

  if (intent.needsTriage && intent.symptoms) {
    agentsUsed.push("Triage Agent");
    promises.push(
      callTriageAgent(intent.symptoms, intent.patientId ?? undefined).then((r) => {
        triageResult = r;
      }),
    );
  }

  if (intent.needsMemory && intent.patientId) {
    agentsUsed.push("Memory Agent (Gracestack AI)");
    promises.push(
      callMemoryAgent(intent.patientId, "history", intent.symptoms ?? undefined).then((r) => {
        memoryResult = r;
      }),
    );
  }

  if (intent.needsFhir && intent.patientId) {
    agentsUsed.push("FHIR Agent");
    promises.push(
      callFhirAgent(intent.patientId, "summary").then((r) => {
        fhirData = r;
      }),
    );
  }

  await Promise.all(promises);
  console.log(`✅ Agents completed: ${agentsUsed.join(", ")}`);

  // Step 3: Synthesize response
  const response = await synthesizeResponse(intent, triageResult, memoryResult, fhirData);

  return {
    response,
    agentsUsed,
    triageResult: triageResult ?? undefined,
    memoryResult: memoryResult ?? undefined,
    fhirData: fhirData ?? undefined,
  };
}

// --- Express Server ---

const app = express();
app.use(cors());
app.use(express.json());

app.post("/orchestrate", async (req, res) => {
  try {
    const body = req.body as OrchestrationRequest;
    if (!body.userMessage) {
      res.status(400).json({ error: "userMessage is required" });
      return;
    }
    const result = await orchestrate(body);
    res.json(result);
  } catch (err) {
    console.error("Orchestration error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", agent: "orchestration", port: PORT });
});

// Agent discovery endpoint
app.get("/agents", async (_req, res) => {
  const agents = [
    { name: "Triage Agent", url: TRIAGE_AGENT_URL, port: 10020 },
    { name: "Memory Agent (Gracestack AI)", url: MEMORY_AGENT_URL, port: 10021 },
    { name: "FHIR Agent", url: FHIR_AGENT_URL, port: 10028 },
  ];

  const statuses = await Promise.all(
    agents.map(async (agent) => {
      try {
        const r = await fetch(`${agent.url}/health`);
        return { ...agent, status: r.ok ? "online" : "offline" };
      } catch {
        return { ...agent, status: "offline" };
      }
    }),
  );

  res.json(statuses);
});

app.listen(PORT, () => {
  console.log(`🚀 Orchestration Agent running on http://localhost:${PORT}`);
  console.log(`   POST /orchestrate — Send natural language queries`);
  console.log(`   GET  /agents      — Discover available agents`);
  console.log(`   GET  /health      — Health check`);
});
