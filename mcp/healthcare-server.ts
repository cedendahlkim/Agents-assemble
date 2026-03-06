// LAGER 1 — FHIR MCP Server
// Exponerar FHIR-resurser som MCP-verktyg: get_patient, get_observations, write_observation, search_conditions

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FhirClient } from "../shared/fhir-client.js";

const fhir = new FhirClient(process.env.FHIR_BASE_URL);

const server = new McpServer({
  name: "healthcare-fhir",
  version: "1.0.0",
});

// --- Tool: get_patient ---
server.tool(
  "get_patient",
  "Fetch a FHIR Patient resource by ID or search by name",
  {
    patientId: z.string().optional().describe("FHIR Patient resource ID"),
    name: z.string().optional().describe("Patient name to search for"),
  },
  async ({ patientId, name }) => {
    try {
      if (patientId) {
        const patient = await fhir.getPatient(patientId);
        return { content: [{ type: "text" as const, text: JSON.stringify(patient, null, 2) }] };
      }
      if (name) {
        const bundle = await fhir.searchPatients({ name });
        return { content: [{ type: "text" as const, text: JSON.stringify(bundle, null, 2) }] };
      }
      return { content: [{ type: "text" as const, text: "Provide either patientId or name." }], isError: true };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// --- Tool: get_observations ---
server.tool(
  "get_observations",
  "Fetch recent FHIR Observations for a patient",
  {
    patientId: z.string().describe("FHIR Patient resource ID"),
  },
  async ({ patientId }) => {
    try {
      const bundle = await fhir.getObservations(patientId);
      return { content: [{ type: "text" as const, text: JSON.stringify(bundle, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// --- Tool: write_observation ---
server.tool(
  "write_observation",
  "Write a new FHIR Observation to the server",
  {
    patientId: z.string().describe("FHIR Patient resource ID"),
    code: z.string().describe("LOINC or SNOMED code for the observation"),
    codeDisplay: z.string().describe("Human-readable display for the code"),
    value: z.string().describe("Observation value as string"),
    status: z
      .enum(["registered", "preliminary", "final", "amended"])
      .default("preliminary")
      .describe("Observation status"),
  },
  async ({ patientId, code, codeDisplay, value, status }) => {
    try {
      const observation = {
        resourceType: "Observation",
        status,
        code: {
          coding: [{ system: "http://loinc.org", code, display: codeDisplay }],
          text: codeDisplay,
        },
        subject: { reference: `Patient/${patientId}` },
        valueString: value,
        effectiveDateTime: new Date().toISOString(),
      };
      const result = await fhir.writeObservation(observation);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// --- Tool: search_conditions ---
server.tool(
  "search_conditions",
  "Search FHIR Conditions by patient and/or code",
  {
    patientId: z.string().optional().describe("FHIR Patient resource ID"),
    code: z.string().optional().describe("Condition code to search for"),
  },
  async ({ patientId, code }) => {
    try {
      const params: Record<string, string> = {};
      if (patientId) params.patient = patientId;
      if (code) params.code = code;
      const bundle = await fhir.searchConditions(params);
      return { content: [{ type: "text" as const, text: JSON.stringify(bundle, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Healthcare FHIR MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
