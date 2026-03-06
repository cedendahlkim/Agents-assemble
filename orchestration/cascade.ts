// LAGER 3 — Orchestration Agent (Cascade Remote)
// Takes natural language input, discovers agents via A2A, delegates tasks, synthesizes responses.
// Uses Gemini as LLM backbone for intent parsing and response generation.

import "dotenv/config";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
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
  emitAgentEvent("User", "Orchestration", req.userMessage.slice(0, 80), "call");

  // Step 1: Analyze intent
  const intent = await analyzeIntent(req.userMessage);
  console.log("🎯 Intent:", JSON.stringify(intent, null, 2));
  emitAgentEvent("Orchestration", "Intent Parser", `patient=${intent.patientId ?? "unknown"}, triage=${intent.needsTriage}, memory=${intent.needsMemory}`, "response");

  const agentsUsed: string[] = [];
  let triageResult: TriageResult | null = null;
  let memoryResult: MemoryResult | null = null;
  let fhirData: FhirPatientSummary | null = null;

  // Step 2: Parallel agent calls based on intent
  const promises: Promise<void>[] = [];

  if (intent.needsTriage && intent.symptoms) {
    agentsUsed.push("Triage Agent");
    emitAgentEvent("Orchestration", "Triage Agent", `assess: ${intent.symptoms.slice(0, 60)}`, "call");
    promises.push(
      callTriageAgent(intent.symptoms, intent.patientId ?? undefined).then((r) => {
        triageResult = r;
        if (r) emitAgentEvent("Triage Agent", "Orchestration", `priority: ${r.priority}`, "response");
      }),
    );
  }

  if (intent.needsMemory && intent.patientId) {
    agentsUsed.push("Memory Agent (Gracestack AI)");
    emitAgentEvent("Orchestration", "Memory Agent", `check patient history: ${intent.patientId}`, "call");
    promises.push(
      callMemoryAgent(intent.patientId, "history", intent.symptoms ?? undefined).then((r) => {
        memoryResult = r;
        if (r) {
          emitAgentEvent("Memory Agent", "Orchestration", `${r.memories.length} memories, ${r.patterns.length} patterns found`, "response");
          if (r.gutFeelingFlags.length > 0) {
            for (const f of r.gutFeelingFlags) {
              emitAgentEvent("Memory Agent", "Orchestration", `⚠️ Gut Feeling: ${f.description} (${(f.confidence * 100).toFixed(0)}%)`, "flag");
            }
          }
        }
      }),
    );
  }

  if (intent.needsFhir && intent.patientId) {
    agentsUsed.push("FHIR Agent");
    emitAgentEvent("Orchestration", "FHIR Agent", `fetch: patient ${intent.patientId} summary`, "call");
    promises.push(
      callFhirAgent(intent.patientId, "summary").then((r) => {
        fhirData = r;
        if (r) emitAgentEvent("FHIR Agent", "Orchestration", `${r.conditions.length} conditions, ${r.medications.length} meds`, "response");
      }),
    );
  }

  await Promise.all(promises);
  console.log(`✅ Agents completed: ${agentsUsed.join(", ")}`);

  // Step 3: Synthesize response
  emitAgentEvent("Orchestration", "Gemini LLM", "synthesize clinical summary", "call");
  const response = await synthesizeResponse(intent, triageResult, memoryResult, fhirData);
  emitAgentEvent("Orchestration", "User", "Clinical summary ready", "response");

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

// --- A2A Agent Cards (.well-known/agent.json) ---

const CARDS_DIR = join(__dirname, "..", "agents", "agent-cards");

function loadCard(name: string) {
  return JSON.parse(readFileSync(join(CARDS_DIR, `${name}.json`), "utf-8"));
}

app.get("/.well-known/agent.json", (_req, res) => {
  res.json(loadCard("orchestration"));
});
app.get("/agents/triage/.well-known/agent.json", (_req, res) => {
  res.json(loadCard("triage"));
});
app.get("/agents/memory/.well-known/agent.json", (_req, res) => {
  res.json(loadCard("memory"));
});
app.get("/agents/fhir/.well-known/agent.json", (_req, res) => {
  res.json(loadCard("fhir"));
});

// --- Agent Event Bus (SSE for Activity Visualizer) ---

interface AgentEvent {
  timestamp: string;
  from: string;
  to: string;
  message: string;
  type: "call" | "response" | "flag";
}

const eventClients: Set<express.Response> = new Set();
const recentEvents: AgentEvent[] = [];
const MAX_RECENT_EVENTS = 100;

function emitAgentEvent(from: string, to: string, message: string, type: AgentEvent["type"] = "call") {
  const event: AgentEvent = {
    timestamp: new Date().toISOString(),
    from,
    to,
    message,
    type,
  };
  recentEvents.push(event);
  if (recentEvents.length > MAX_RECENT_EVENTS) recentEvents.shift();
  for (const client of eventClients) {
    client.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

app.get("/api/agent-stream", (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  // Send recent events on connect
  for (const event of recentEvents.slice(-20)) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  eventClients.add(res);
  _req.on("close", () => eventClients.delete(res));
});

app.get("/api/agent-events", (_req, res) => {
  res.json(recentEvents.slice(-50));
});

// --- Rate Limiting (simple in-memory) ---

const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// --- OpenAI-Compatible API Wrapper ---

const GRACESTACK_MODEL_ID = "gracestack-ai";
const GRACESTACK_MODEL_CREATED = Math.floor(Date.now() / 1000);

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIChatRequest {
  model?: string;
  messages: OpenAIChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  user?: string;
}

function buildOpenAIResponse(
  content: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
) {
  return {
    id: `chatcmpl-${uuidv4()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

function buildOpenAIChunk(
  id: string,
  model: string,
  delta: { role?: string; content?: string },
  finishReason: string | null,
) {
  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function extractUserMessage(messages: OpenAIChatMessage[]): string {
  // Concatenate system context + last user message for orchestration
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content);
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";

  // Include system context as prefix if present
  const prefix = systemParts.length > 0 ? `[Context: ${systemParts.join(" ")}]\n` : "";
  return prefix + lastUser.content;
}

// POST /v1/chat/completions — OpenAI-compatible Chat Completions
app.post("/v1/chat/completions", async (req, res) => {
  try {
    // Rate limiting
    const clientIp = req.ip ?? req.socket.remoteAddress ?? "unknown";
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({
        error: { message: "Rate limit exceeded (60 req/min)", type: "rate_limit_error", code: "rate_limit_exceeded" },
      });
      return;
    }

    const body = req.body as OpenAIChatRequest;

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({
        error: { message: "messages is required and must be a non-empty array", type: "invalid_request_error", code: "invalid_messages" },
      });
      return;
    }

    const userMessage = extractUserMessage(body.messages);
    if (!userMessage) {
      res.status(400).json({
        error: { message: "No user message found in messages array", type: "invalid_request_error", code: "missing_user_message" },
      });
      return;
    }

    const modelId = body.model || GRACESTACK_MODEL_ID;
    console.log(`\n🔌 OpenAI-compat request [model=${modelId}, stream=${!!body.stream}]: "${userMessage.slice(0, 100)}..."`);

    if (body.stream) {
      // --- Streaming (SSE) ---
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const completionId = `chatcmpl-${uuidv4()}`;

      // Send role chunk
      const roleChunk = buildOpenAIChunk(completionId, modelId, { role: "assistant" }, null);
      res.write(`data: ${JSON.stringify(roleChunk)}\n\n`);

      // Run orchestration
      const result = await orchestrate({ userMessage });

      // Stream response in chunks
      const words = result.response.split(/(\s+)/);
      for (const word of words) {
        const chunk = buildOpenAIChunk(completionId, modelId, { content: word }, null);
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      // Append agent metadata
      if (result.agentsUsed.length > 0) {
        const meta = `\n\n---\n*Agents used: ${result.agentsUsed.join(", ")}*`;
        const metaChunk = buildOpenAIChunk(completionId, modelId, { content: meta }, null);
        res.write(`data: ${JSON.stringify(metaChunk)}\n\n`);
      }

      // Send stop chunk
      const stopChunk = buildOpenAIChunk(completionId, modelId, {}, "stop");
      res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      // --- Non-streaming ---
      const result = await orchestrate({ userMessage });

      let content = result.response;
      if (result.agentsUsed.length > 0) {
        content += `\n\n---\n*Agents used: ${result.agentsUsed.join(", ")}*`;
      }

      const promptTokens = Math.ceil(userMessage.length / 4);
      const completionTokens = Math.ceil(content.length / 4);

      const response = buildOpenAIResponse(content, modelId, promptTokens, completionTokens);

      // Add gracestack_metadata (hackathon differentiator)
      const enriched = {
        ...response,
        gracestack_metadata: {
          triage_priority: result.triageResult?.priority ?? null,
          gut_feeling_flags: result.memoryResult?.gutFeelingFlags ?? [],
          memory_hits: result.memoryResult?.memories?.length ?? 0,
          hdc_confidence: result.memoryResult?.gutFeelingFlags?.[0]?.confidence ?? null,
          agents_used: result.agentsUsed,
          fhir_written: !!result.fhirData,
        },
      };

      // SHARP context headers (Prompt Opinion integration)
      if (result.triageResult) {
        res.setHeader("X-SHARP-Triage-Level", result.triageResult.priority);
      }
      if (result.memoryResult?.patientId) {
        res.setHeader("X-SHARP-Patient-Context", result.memoryResult.patientId);
      }
      res.setHeader("X-SHARP-Memory-Context", response.id);

      res.json(enriched);
    }
  } catch (err) {
    console.error("OpenAI-compat error:", err);
    res.status(500).json({
      error: { message: (err as Error).message, type: "server_error", code: "internal_error" },
    });
  }
});

// GET /v1/models — List available models
app.get("/v1/models", (_req, res) => {
  res.json({
    object: "list",
    data: [
      {
        id: GRACESTACK_MODEL_ID,
        object: "model",
        created: GRACESTACK_MODEL_CREATED,
        owned_by: "gracestack",
        permission: [],
        root: GRACESTACK_MODEL_ID,
        parent: null,
      },
      {
        id: "gracestack-ai-triage",
        object: "model",
        created: GRACESTACK_MODEL_CREATED,
        owned_by: "gracestack",
        permission: [],
        root: "gracestack-ai-triage",
        parent: GRACESTACK_MODEL_ID,
      },
      {
        id: "gracestack-ai-memory",
        object: "model",
        created: GRACESTACK_MODEL_CREATED,
        owned_by: "gracestack",
        permission: [],
        root: "gracestack-ai-memory",
        parent: GRACESTACK_MODEL_ID,
      },
    ],
  });
});

// GET /v1/models/:model — Get specific model
app.get("/v1/models/:model", (req, res) => {
  const models: Record<string, object> = {
    [GRACESTACK_MODEL_ID]: {
      id: GRACESTACK_MODEL_ID,
      object: "model",
      created: GRACESTACK_MODEL_CREATED,
      owned_by: "gracestack",
    },
  };
  const m = models[req.params.model];
  if (m) {
    res.json(m);
  } else {
    res.status(404).json({
      error: { message: `Model '${req.params.model}' not found`, type: "invalid_request_error", code: "model_not_found" },
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Orchestration Agent running on http://localhost:${PORT}`);
  console.log(`   POST /orchestrate          — Native orchestration API`);
  console.log(`   POST /v1/chat/completions  — OpenAI-compatible Chat API`);
  console.log(`   GET  /v1/models            — List models`);
  console.log(`   GET  /agents               — Discover available agents`);
  console.log(`   GET  /health               — Health check`);
});
