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
