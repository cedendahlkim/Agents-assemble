// LAGER 2 — Agent A: Triage Agent (Port 10020)
// Tar emot symptombeskrivning, bedömer prioritet, skriver FHIR Observation
// Kommunicerar via A2A-protokollet

import "dotenv/config";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import {
  AgentCard,
  Message,
  AGENT_CARD_PATH,
} from "@a2a-js/sdk";
import {
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
  DefaultRequestHandler,
  InMemoryTaskStore,
} from "@a2a-js/sdk/server";
import {
  agentCardHandler,
  jsonRpcHandler,
  UserBuilder,
} from "@a2a-js/sdk/server/express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { FhirClient } from "../../shared/fhir-client.js";
import type { TriagePriority, TriageResult } from "../../shared/types.js";
import { safeParseJson } from "../../shared/llm-utils.js";

const PORT = parseInt(process.env.TRIAGE_AGENT_PORT ?? "10020", 10);
const fhir = new FhirClient();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const TRIAGE_SYSTEM_PROMPT = `You are a medical triage assistant. Given a patient's symptoms, assess the urgency.
Respond ONLY with valid JSON in this exact format:
{
  "priority": "Low" | "Medium" | "High" | "Critical",
  "reasoning": "Brief clinical reasoning for the priority level"
}
Consider: chest pain, breathing difficulty, stroke symptoms, and severe bleeding as Critical/High.
Consider: fever, moderate pain, infections as Medium.
Consider: minor complaints, chronic stable conditions as Low.`;

async function assessTriage(symptoms: string): Promise<{ priority: TriagePriority; reasoning: string }> {
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: symptoms }] }],
    systemInstruction: { role: "system", parts: [{ text: TRIAGE_SYSTEM_PROMPT }] },
    generationConfig: { maxOutputTokens: 512 },
  });

  const text = result.response.text();
  return safeParseJson(text, { priority: "Medium" as TriagePriority, reasoning: `LLM parse error, defaulting. Raw: ${text}` });
}

async function writeTriageObservation(patientId: string, result: TriageResult): Promise<string | undefined> {
  try {
    const observation = {
      resourceType: "Observation",
      status: "preliminary" as const,
      code: {
        coding: [{ system: "http://loinc.org", code: "11283-9", display: "Triage assessment" }],
        text: `Triage: ${result.priority}`,
      },
      subject: { reference: `Patient/${patientId}` },
      valueString: `Priority: ${result.priority}. ${result.reasoning}`,
      effectiveDateTime: result.timestamp,
    };
    const created = await fhir.writeObservation(observation);
    return created.id as string | undefined;
  } catch (err) {
    console.error("Failed to write triage observation:", err);
    return undefined;
  }
}

// --- A2A Agent Definition ---
const triageCard: AgentCard = {
  name: "Triage Agent",
  description: "Assesses patient symptom urgency and writes triage observations to FHIR",
  protocolVersion: "0.3.0",
  version: "1.0.0",
  url: `http://localhost:${PORT}/a2a/jsonrpc`,
  skills: [
    {
      id: "triage",
      name: "Symptom Triage",
      description: "Assess urgency of patient symptoms: Low / Medium / High / Critical",
      tags: ["triage", "healthcare", "priority"],
    },
  ],
  capabilities: { pushNotifications: false },
  defaultInputModes: ["text"],
  defaultOutputModes: ["text"],
};

class TriageExecutor implements AgentExecutor {
  async execute(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const incomingMessage = context.userMessage;
    const userText = incomingMessage?.parts
      ?.filter((p: { kind: string }): p is { kind: "text"; text: string } => p.kind === "text")
      .map((p: { kind: "text"; text: string }) => p.text)
      .join(" ") ?? "";

    if (!userText) {
      eventBus.publish({
        kind: "message",
        messageId: uuidv4(),
        role: "agent",
        parts: [{ kind: "text", text: "No symptoms provided. Please describe the patient's symptoms." }],
        contextId: context.contextId,
      });
      eventBus.finished();
      return;
    }

    // Parse optional patientId from structured input: "patientId:XXX symptoms:..."
    const patientIdMatch = userText.match(/patientId:(\S+)/);
    const patientId = patientIdMatch?.[1] ?? "unknown";
    const symptoms = userText.replace(/patientId:\S+\s*/, "").trim();

    const assessment = await assessTriage(symptoms);
    const timestamp = new Date().toISOString();

    const triageResult: TriageResult = {
      patientId,
      priority: assessment.priority,
      reasoning: assessment.reasoning,
      timestamp,
    };

    // Write to FHIR if we have a real patient ID
    if (patientId !== "unknown") {
      triageResult.observationId = await writeTriageObservation(patientId, triageResult);
    }

    const responseMessage: Message = {
      kind: "message",
      messageId: uuidv4(),
      role: "agent",
      parts: [{ kind: "text", text: JSON.stringify(triageResult, null, 2) }],
      contextId: context.contextId,
    };

    eventBus.publish(responseMessage);
    eventBus.finished();
  }

  cancelTask = async (): Promise<void> => {};
}

// --- Start Server ---
const executor = new TriageExecutor();
const requestHandler = new DefaultRequestHandler(triageCard, new InMemoryTaskStore(), executor);

const app = express();
app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: requestHandler }));
app.use("/a2a/jsonrpc", jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok", agent: "triage", port: PORT }));

app.listen(PORT, () => {
  console.log(`🏥 Triage Agent running on http://localhost:${PORT}`);
});
