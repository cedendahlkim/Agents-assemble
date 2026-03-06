// LAGER 2 — Agent C: FHIR Agent (Port 10028)
// Hämtar och skriver patientjournaldata
// Normaliserar FHIR R4 resurser till intern representation

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
import { FhirClient } from "../../shared/fhir-client.js";
import type { FhirResource, FhirBundle, DrugInteractionResult } from "../../shared/fhir-client.js";
import type { FhirPatientSummary } from "../../shared/types.js";

const PORT = parseInt(process.env.FHIR_AGENT_PORT ?? "10028", 10);
const fhir = new FhirClient();

// --- FHIR Normalization helpers ---
function extractPatientName(patient: FhirResource): string {
  const names = patient.name as Array<{ given?: string[]; family?: string }> | undefined;
  if (!names?.length) return "Unknown";
  const n = names[0];
  return [n.given?.join(" "), n.family].filter(Boolean).join(" ");
}

function extractConditionTexts(bundle: FhirBundle): string[] {
  return (
    bundle.entry?.map((e) => {
      const code = e.resource.code as { text?: string; coding?: Array<{ display?: string }> } | undefined;
      return code?.text ?? code?.coding?.[0]?.display ?? "Unknown condition";
    }) ?? []
  );
}

function extractMedicationTexts(bundle: FhirBundle): string[] {
  return (
    bundle.entry?.map((e) => {
      const med = e.resource.medicationCodeableConcept as
        | { text?: string; coding?: Array<{ display?: string }> }
        | undefined;
      return med?.text ?? med?.coding?.[0]?.display ?? "Unknown medication";
    }) ?? []
  );
}

function extractObservationTexts(bundle: FhirBundle): string[] {
  return (
    bundle.entry?.slice(0, 10).map((e) => {
      const code = e.resource.code as { text?: string } | undefined;
      const value = (e.resource.valueString as string) ?? (e.resource.valueQuantity as { value?: number })?.value?.toString() ?? "";
      return `${code?.text ?? "Observation"}: ${value}`;
    }) ?? []
  );
}

async function buildPatientSummary(patientId: string): Promise<FhirPatientSummary> {
  const [patient, conditions, medications, observations] = await Promise.all([
    fhir.getPatient(patientId),
    fhir.getConditions(patientId),
    fhir.getMedications(patientId),
    fhir.getObservations(patientId),
  ]);

  return {
    id: patientId,
    name: extractPatientName(patient),
    birthDate: patient.birthDate as string | undefined,
    conditions: extractConditionTexts(conditions),
    medications: extractMedicationTexts(medications),
    recentObservations: extractObservationTexts(observations),
  };
}

// --- A2A Agent Definition ---
const fhirCard: AgentCard = {
  name: "FHIR Agent",
  description: "Fetches and writes patient journal data from FHIR R4. Normalizes resources to internal representations.",
  protocolVersion: "0.3.0",
  version: "1.0.0",
  url: `http://localhost:${PORT}/a2a/jsonrpc`,
  skills: [
    {
      id: "patient-summary",
      name: "Patient Summary",
      description: "Get a normalized summary of a patient's journal: conditions, medications, observations",
      tags: ["fhir", "patient", "journal"],
    },
    {
      id: "write-observation",
      name: "Write Observation",
      description: "Write a new clinical observation to the patient's FHIR journal",
      tags: ["fhir", "write", "observation"],
    },
  ],
  capabilities: { pushNotifications: false },
  defaultInputModes: ["text"],
  defaultOutputModes: ["text"],
};

interface FhirCommand {
  action: "summary" | "write_observation";
  patientId: string;
  code?: string;
  codeDisplay?: string;
  value?: string;
}

function parseCommand(text: string): FhirCommand {
  // Try JSON parse first
  try {
    return JSON.parse(text);
  } catch {
    // Fallback: simple text format "summary patientId:XXX" or "write patientId:XXX ..."
  }

  const patientIdMatch = text.match(/patientId:(\S+)/);
  const patientId = patientIdMatch?.[1] ?? "unknown";

  if (text.toLowerCase().includes("write")) {
    return { action: "write_observation", patientId, value: text };
  }
  return { action: "summary", patientId };
}

class FhirExecutor implements AgentExecutor {
  async execute(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const userText = context.userMessage?.parts
      ?.filter((p: { kind: string }): p is { kind: "text"; text: string } => p.kind === "text")
      .map((p: { kind: "text"; text: string }) => p.text)
      .join(" ") ?? "";

    try {
      const command = parseCommand(userText);

      let responseText: string;

      if (command.action === "summary") {
        const summary = await buildPatientSummary(command.patientId);
        responseText = JSON.stringify(summary, null, 2);
      } else {
        const observation = {
          resourceType: "Observation",
          status: "preliminary",
          code: {
            coding: [
              {
                system: "http://loinc.org",
                code: command.code ?? "75325-1",
                display: command.codeDisplay ?? "Clinical note",
              },
            ],
            text: command.codeDisplay ?? "Clinical note",
          },
          subject: { reference: `Patient/${command.patientId}` },
          valueString: command.value ?? "",
          effectiveDateTime: new Date().toISOString(),
        };
        const result = await fhir.writeObservation(observation);
        responseText = JSON.stringify(result, null, 2);
      }

      eventBus.publish({
        kind: "message",
        messageId: uuidv4(),
        role: "agent",
        parts: [{ kind: "text", text: responseText }],
        contextId: context.contextId,
      });
    } catch (err) {
      eventBus.publish({
        kind: "message",
        messageId: uuidv4(),
        role: "agent",
        parts: [{ kind: "text", text: `FHIR Agent error: ${(err as Error).message}` }],
        contextId: context.contextId,
      });
    }

    eventBus.finished();
  }

  cancelTask = async (): Promise<void> => {};
}

// --- Start Server ---
const executor = new FhirExecutor();
const requestHandler = new DefaultRequestHandler(fhirCard, new InMemoryTaskStore(), executor);

const app = express();
app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: requestHandler }));
app.use("/a2a/jsonrpc", jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));

app.use(express.json());

// --- Extended FHIR R4 REST Endpoints (Komponent 5) ---

// GET /fhir/patient/:id — Full patient summary
app.get("/fhir/patient/:id", async (req, res) => {
  try {
    const summary = await buildPatientSummary(req.params.id);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /fhir/allergies/:patientId — AllergyIntolerance
app.get("/fhir/allergies/:patientId", async (req, res) => {
  try {
    const bundle = await fhir.getAllergies(req.params.patientId);
    const allergies = bundle.entry?.map((e) => {
      const code = e.resource.code as { text?: string; coding?: Array<{ display?: string }> } | undefined;
      return {
        id: e.resource.id,
        substance: code?.text ?? code?.coding?.[0]?.display ?? "Unknown",
        criticality: e.resource.criticality ?? "unknown",
      };
    }) ?? [];
    res.json({ patient_id: req.params.patientId, allergies });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /fhir/encounters/:patientId — Encounter history
app.get("/fhir/encounters/:patientId", async (req, res) => {
  try {
    const bundle = await fhir.getEncounters(req.params.patientId);
    const encounters = bundle.entry?.map((e) => ({
      id: e.resource.id,
      status: e.resource.status,
      class: (e.resource.class as { code?: string })?.code ?? "unknown",
      period: e.resource.period,
    })) ?? [];
    res.json({ patient_id: req.params.patientId, encounters });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /fhir/encounter — Log AI consultation as FHIR Encounter
app.post("/fhir/encounter", async (req, res) => {
  try {
    const { patientId, summary, triageLevel } = req.body;
    const encounter = {
      resourceType: "Encounter",
      status: "finished",
      class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "VR", display: "virtual" },
      subject: { reference: `Patient/${patientId}` },
      period: { start: new Date().toISOString(), end: new Date().toISOString() },
      reasonCode: [{ text: `AI Triage: ${triageLevel ?? "N/A"} — ${summary?.slice(0, 200) ?? "consultation"}` }],
      serviceProvider: { display: "Gracestack AI" },
    };
    const result = await fhir.writeEncounter(encounter as FhirResource);
    res.json({ status: "created", encounter_id: result.id, resourceType: "Encounter" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /fhir/condition — Write new condition/diagnosis
app.post("/fhir/condition", async (req, res) => {
  try {
    const { patientId, code, display, text } = req.body;
    const condition = {
      resourceType: "Condition",
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
      code: {
        coding: code ? [{ system: "http://snomed.info/sct", code, display }] : [],
        text: text ?? display ?? "Unknown condition",
      },
      subject: { reference: `Patient/${patientId}` },
      recordedDate: new Date().toISOString(),
    };
    const result = await fhir.writeCondition(condition as FhirResource);
    res.json({ status: "created", condition_id: result.id, resourceType: "Condition" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /fhir/drug-interactions — Check drug interactions via FDA API
app.post("/fhir/drug-interactions", async (req, res) => {
  try {
    const { medications, patientId } = req.body;
    let meds: string[] = medications ?? [];

    // If patientId provided but no medications, fetch from FHIR
    if (meds.length === 0 && patientId) {
      const medBundle = await fhir.getMedications(patientId);
      meds = medBundle.entry?.map((e) => {
        const med = e.resource.medicationCodeableConcept as { text?: string; coding?: Array<{ display?: string }> } | undefined;
        return med?.text ?? med?.coding?.[0]?.display ?? "";
      }).filter(Boolean) ?? [];
    }

    if (meds.length < 2) {
      res.json({ interactions: [], message: "At least 2 medications required for interaction check" });
      return;
    }

    const interactions = await fhir.checkDrugInteractions(meds);
    res.json({
      patient_id: patientId ?? null,
      medications: meds,
      interactions,
      has_interactions: interactions.length > 0,
      high_severity_count: interactions.filter((i) => i.severity === "high").length,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok", agent: "fhir", port: PORT, fhir_version: "R4" }));

app.listen(PORT, () => {
  console.log(`📋 FHIR Agent running on http://localhost:${PORT}`);
  console.log(`   Extended: Patient, Observation, Condition, MedicationRequest, AllergyIntolerance, Encounter`);
  console.log(`   Drug Interaction Check: FDA FAERS API`);
});
