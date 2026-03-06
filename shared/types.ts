// Shared types for Agents Assemble healthcare system

export type TriagePriority = "Low" | "Medium" | "High" | "Critical";

export interface TriageRequest {
  patientId: string;
  symptoms: string;
  patientName?: string;
  age?: number;
}

export interface TriageResult {
  patientId: string;
  priority: TriagePriority;
  reasoning: string;
  observationId?: string;
  timestamp: string;
}

export interface MemoryQuery {
  patientId: string;
  queryType: "history" | "patterns" | "gut_feeling";
  context?: string;
}

export interface MemoryResult {
  patientId: string;
  memories: PatientMemory[];
  patterns: string[];
  gutFeelingFlags: GutFeelingFlag[];
}

export interface PatientMemory {
  content: string;
  strength: number; // 0.0–1.0, Ebbinghaus decay
  lastAccessed: string;
  category: "condition" | "medication" | "observation" | "procedure";
}

export interface GutFeelingFlag {
  description: string;
  confidence: number; // 0.0–1.0
  relatedMemories: string[];
}

export interface FhirPatientSummary {
  id: string;
  name: string;
  birthDate?: string;
  conditions: string[];
  medications: string[];
  recentObservations: string[];
}

export interface OrchestrationRequest {
  userMessage: string;
  sessionId?: string;
}

export interface OrchestrationResponse {
  response: string;
  agentsUsed: string[];
  triageResult?: TriageResult;
  memoryResult?: MemoryResult;
  fhirData?: FhirPatientSummary;
}
