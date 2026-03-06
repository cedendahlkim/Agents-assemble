// Bride Module: Ebbinghaus — Spaced Repetition Memory Decay
//
// R = e^(-t/S) where R = retention, t = time since last review, S = stability
// Critical findings get stability bonuses. Reinforcement increases S.

export interface Memory {
  id: string;
  patientId: string;
  content: string;
  category: "condition" | "medication" | "observation" | "procedure";
  createdAt: number; // epoch ms
  lastAccessed: number; // epoch ms
  stability: number; // hours
  accessCount: number;
}

const BASE_STABILITY = 72; // hours
const REINFORCEMENT_FACTOR = 1.5;
const CRITICAL_BONUS = 2.0;
const DECAY_THRESHOLD = 0.05;

function isCriticalCategory(category: string): boolean {
  return category === "condition" || category === "procedure";
}

export function createMemory(
  patientId: string,
  content: string,
  category: Memory["category"],
): Memory {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    patientId,
    content,
    category,
    createdAt: now,
    lastAccessed: now,
    stability: isCriticalCategory(category) ? BASE_STABILITY * CRITICAL_BONUS : BASE_STABILITY,
    accessCount: 0,
  };
}

export function currentStrength(m: Memory): number {
  const hoursElapsed = (Date.now() - m.lastAccessed) / (1000 * 60 * 60);
  const retention = Math.exp(-hoursElapsed / m.stability);
  return Math.max(0, Math.min(1, retention));
}

export function reinforce(m: Memory): Memory {
  return {
    ...m,
    lastAccessed: Date.now(),
    accessCount: m.accessCount + 1,
    stability: m.stability * REINFORCEMENT_FACTOR,
  };
}

export function isForgotten(m: Memory): boolean {
  return currentStrength(m) < DECAY_THRESHOLD;
}

export class MemoryStore {
  private memories: Map<string, Memory[]> = new Map();

  constructor() {
    this.seedDemoData();
  }

  addMemory(patientId: string, content: string, category: Memory["category"]): string {
    const memory = createMemory(patientId, content, category);
    const existing = this.memories.get(patientId) ?? [];
    existing.push(memory);
    this.memories.set(patientId, existing);
    return memory.id;
  }

  getMemories(patientId: string): Memory[] {
    return (this.memories.get(patientId) ?? []).filter((m) => !isForgotten(m));
  }

  reinforceMemories(patientId: string): void {
    const existing = this.memories.get(patientId);
    if (existing) {
      this.memories.set(patientId, existing.map(reinforce));
    }
  }

  private seedDemoData(): void {
    const pid = "sven-eriksson";
    const seeds: Array<[string, Memory["category"]]> = [
      ["Myocardial infarction (STEMI) treated with PCI — March 2023", "condition"],
      ["Hypertension diagnosed — ongoing since 2019, managed with Losartan 50mg", "condition"],
      ["Aspirin 75mg daily — prescribed post-MI 2023", "medication"],
      ["Atorvastatin 40mg daily — cholesterol management", "medication"],
      ["Metoprolol 50mg x2 — beta blocker post-MI", "medication"],
      ["Follow-up echocardiogram — EF 45%, mild LV dysfunction — June 2023", "observation"],
      ["Reported intermittent dizziness during exercise — September 2024", "observation"],
      ["Blood pressure well controlled at 130/82 — last visit January 2025", "observation"],
    ];

    for (const [content, category] of seeds) {
      this.addMemory(pid, content, category);
    }

    // Double-reinforce for demo stability
    this.reinforceMemories(pid);
    this.reinforceMemories(pid);
  }
}
