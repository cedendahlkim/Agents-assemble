// Bride Module: HDC — Hyperdimensional Computing
//
// Encodes medical concepts into high-dimensional bipolar vectors (+1/-1).
// Uses bundling (majority vote) for composition and cosine similarity for matching.

const DIMENSIONS = 10_000;

type HyperVector = Int8Array;

function randomHV(): HyperVector {
  const hv = new Int8Array(DIMENSIONS);
  for (let i = 0; i < DIMENSIONS; i++) {
    hv[i] = Math.random() < 0.5 ? 1 : -1;
  }
  return hv;
}

function bundle(vectors: HyperVector[]): HyperVector {
  const result = new Int8Array(DIMENSIONS);
  for (let i = 0; i < DIMENSIONS; i++) {
    let sum = 0;
    for (const v of vectors) {
      sum += v[i];
    }
    result[i] = sum > 0 ? 1 : sum < 0 ? -1 : vectors[0][i];
  }
  return result;
}

function cosineSimilarity(a: HyperVector, b: HyperVector): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < DIMENSIONS; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export interface MemoryEntry {
  content: string;
  strength: number;
  lastAccessed: string;
  category: string;
}

export class HdcEncoder {
  private codebook: Map<string, HyperVector> = new Map();

  private getOrCreateBase(token: string): HyperVector {
    let hv = this.codebook.get(token);
    if (!hv) {
      hv = randomHV();
      this.codebook.set(token, hv);
    }
    return hv;
  }

  private encodeText(text: string): HyperVector {
    const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return randomHV();
    const vectors = tokens.map((t) => this.getOrCreateBase(t));
    return bundle(vectors);
  }

  encodeMemory(content: string, _category: string): void {
    this.encodeText(content);
  }

  findPatterns(memories: MemoryEntry[], context: string): string[] {
    if (memories.length === 0 || !context) return [];

    const contextHV = this.encodeText(context);
    const scored: Array<{ content: string; sim: number }> = [];

    for (const m of memories) {
      const memHV = this.encodeText(m.content);
      const sim = cosineSimilarity(contextHV, memHV);
      if (sim > 0.15) {
        scored.push({ content: m.content, sim });
      }
    }

    scored.sort((a, b) => b.sim - a.sim);

    return scored.slice(0, 5).map((s) => `[HDC sim=${s.sim.toFixed(2)}] ${s.content}`);
  }
}
