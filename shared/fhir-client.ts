// Shared FHIR R4 client for communicating with hapi.fhir.org

const FHIR_BASE_URL = process.env.FHIR_BASE_URL ?? "https://hapi.fhir.org/baseR4";

export interface FhirResource {
  resourceType: string;
  id?: string;
  [key: string]: unknown;
}

export interface FhirBundle {
  resourceType: "Bundle";
  type: string;
  total?: number;
  entry?: Array<{ resource: FhirResource }>;
}

export interface DrugInteractionResult {
  drugA: string;
  drugB: string;
  severity: "low" | "moderate" | "high";
  adverseEventCount: number;
  topReactions: string[];
  source: string;
}

export class FhirClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? FHIR_BASE_URL;
  }

  async getPatient(patientId: string): Promise<FhirResource> {
    return this.read("Patient", patientId);
  }

  async searchPatients(params: Record<string, string>): Promise<FhirBundle> {
    return this.search("Patient", params);
  }

  async getObservations(patientId: string): Promise<FhirBundle> {
    return this.search("Observation", { patient: patientId, _sort: "-date", _count: "20" });
  }

  async writeObservation(observation: FhirResource): Promise<FhirResource> {
    return this.create("Observation", observation);
  }

  async getConditions(patientId: string): Promise<FhirBundle> {
    return this.search("Condition", { patient: patientId });
  }

  async getMedications(patientId: string): Promise<FhirBundle> {
    return this.search("MedicationRequest", { patient: patientId });
  }

  async searchConditions(params: Record<string, string>): Promise<FhirBundle> {
    return this.search("Condition", params);
  }

  // --- Extended FHIR R4 Resources (Komponent 5) ---

  async getAllergies(patientId: string): Promise<FhirBundle> {
    return this.search("AllergyIntolerance", { patient: patientId });
  }

  async getEncounters(patientId: string): Promise<FhirBundle> {
    return this.search("Encounter", { patient: patientId, _sort: "-date", _count: "10" });
  }

  async writeCondition(condition: FhirResource): Promise<FhirResource> {
    return this.create("Condition", condition);
  }

  async writeEncounter(encounter: FhirResource): Promise<FhirResource> {
    return this.create("Encounter", encounter);
  }

  async writePatient(patient: FhirResource): Promise<FhirResource> {
    return this.create("Patient", patient);
  }

  // --- Drug Interaction Check (FDA Adverse Event API) ---

  async checkDrugInteractions(medications: string[]): Promise<DrugInteractionResult[]> {
    const results: DrugInteractionResult[] = [];
    const FDA_BASE = "https://api.fda.gov/drug/event.json";

    // Check pairs of medications for co-occurrence in adverse events
    for (let i = 0; i < medications.length; i++) {
      for (let j = i + 1; j < medications.length; j++) {
        const drugA = medications[i].split(" ")[0]; // First word = drug name
        const drugB = medications[j].split(" ")[0];
        try {
          const query = `search=patient.drug.openfda.generic_name:"${drugA}"+AND+patient.drug.openfda.generic_name:"${drugB}"&count=patient.reaction.reactionmeddrapt.exact&limit=5`;
          const response = await fetch(`${FDA_BASE}?${query}`, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) {
            const data = await response.json() as { results?: Array<{ term: string; count: number }> };
            if (data.results && data.results.length > 0) {
              const totalEvents = data.results.reduce((sum, r) => sum + r.count, 0);
              const topReactions = data.results.slice(0, 3).map((r) => r.term);
              results.push({
                drugA,
                drugB,
                severity: totalEvents > 100 ? "high" : totalEvents > 20 ? "moderate" : "low",
                adverseEventCount: totalEvents,
                topReactions,
                source: "FDA FAERS",
              });
            }
          }
        } catch {
          // FDA API timeout or error — skip silently
        }
      }
    }
    return results;
  }

  private async read(resourceType: string, id: string): Promise<FhirResource> {
    const response = await fetch(`${this.baseUrl}/${resourceType}/${id}`, {
      headers: { Accept: "application/fhir+json" },
    });
    if (!response.ok) {
      throw new Error(`FHIR read ${resourceType}/${id} failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<FhirResource>;
  }

  private async search(resourceType: string, params: Record<string, string>): Promise<FhirBundle> {
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`${this.baseUrl}/${resourceType}?${query}`, {
      headers: { Accept: "application/fhir+json" },
    });
    if (!response.ok) {
      throw new Error(`FHIR search ${resourceType} failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<FhirBundle>;
  }

  private async create(resourceType: string, resource: FhirResource): Promise<FhirResource> {
    const response = await fetch(`${this.baseUrl}/${resourceType}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/fhir+json",
        Accept: "application/fhir+json",
      },
      body: JSON.stringify({ ...resource, resourceType }),
    });
    if (!response.ok) {
      throw new Error(`FHIR create ${resourceType} failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<FhirResource>;
  }
}
