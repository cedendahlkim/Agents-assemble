const API_BASE = "/api";

export interface TriageResult {
  patientId: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  reasoning: string;
  timestamp: string;
}

export interface MemoryItem {
  content: string;
  strength: number;
  category: string;
}

export interface GutFeelingFlag {
  description: string;
  confidence: number;
  relatedMemories?: string[];
}

export interface MemoryResult {
  patientId: string;
  memories: MemoryItem[];
  patterns: unknown[];
  gutFeelingFlags: GutFeelingFlag[];
}

export interface OrchestrationResponse {
  response: string;
  agentsUsed: string[];
  triageResult?: TriageResult;
  memoryResult?: MemoryResult;
  fhirData?: unknown;
}

export interface AgentStatus {
  name: string;
  url: string;
  port: number;
  status: "online" | "offline";
}

export async function orchestrate(userMessage: string): Promise<OrchestrationResponse> {
  const res = await fetch(`${API_BASE}/orchestrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userMessage }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchAgents(): Promise<AgentStatus[]> {
  const res = await fetch(`${API_BASE}/agents`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
