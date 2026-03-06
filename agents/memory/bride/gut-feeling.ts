// Bride Module: Gut Feeling — Anomaly Detection
//
// Identifies unusual combinations: drug interactions, symptom escalation patterns.
// Flags with confidence scores. This is the "sixth sense" of Gracestack AI.

export interface GutFeelingFlag {
  description: string;
  confidence: number;
  relatedMemories: string[];
}

interface MemoryEntry {
  content: string;
  strength: number;
  category: string;
}

const KNOWN_INTERACTIONS: Array<[string, string, string, number]> = [
  ["aspirin", "ibuprofen", "NSAID + Aspirin: increased bleeding risk", 0.85],
  ["aspirin", "warfarin", "Aspirin + Warfarin: significantly elevated bleeding risk", 0.92],
  ["metoprolol", "verapamil", "Beta-blocker + Calcium channel blocker: risk of severe bradycardia", 0.88],
  ["losartan", "potassium", "ARB + Potassium supplement: risk of hyperkalemia", 0.80],
  ["statin", "grapefruit", "Statin + Grapefruit: increased statin toxicity risk", 0.70],
  ["metformin", "contrast", "Metformin + IV contrast: risk of lactic acidosis", 0.82],
  ["ssri", "tramadol", "SSRI + Tramadol: risk of serotonin syndrome", 0.87],
  ["ace inhibitor", "potassium", "ACE inhibitor + Potassium: risk of hyperkalemia", 0.81],
  ["warfarin", "vitamin k", "Warfarin + Vitamin K: reduced anticoagulant effect", 0.78],
  ["lithium", "ibuprofen", "Lithium + NSAID: risk of lithium toxicity", 0.84],
  ["methotrexate", "trimethoprim", "Methotrexate + Trimethoprim: increased bone marrow toxicity", 0.86],
  ["digoxin", "amiodarone", "Digoxin + Amiodarone: risk of digoxin toxicity", 0.83],
];

const ESCALATION_PATTERNS: Array<[string[], string, number]> = [
  [
    ["chest pain", "dizziness", "cardiac"],
    "Recurring cardiac symptoms with history of cardiac event — possible deterioration",
    0.88,
  ],
  [
    ["headache", "vision", "hypertension"],
    "Headache + vision changes with hypertension history — check for hypertensive emergency",
    0.78,
  ],
  [
    ["fatigue", "weight", "thyroid"],
    "Fatigue + weight changes with thyroid history — possible thyroid dysfunction",
    0.72,
  ],
  [
    ["shortness of breath", "edema", "cardiac"],
    "Dyspnea + edema with cardiac history — possible heart failure exacerbation",
    0.90,
  ],
  [
    ["confusion", "falls", "medication"],
    "Confusion + falls with polypharmacy — possible adverse drug reaction",
    0.82,
  ],
  [
    ["bleeding", "bruising", "anticoagul"],
    "Bleeding + bruising with anticoagulant therapy — possible over-anticoagulation",
    0.85,
  ],
];

export class GutFeeling {
  analyze(memories: MemoryEntry[], context: string): GutFeelingFlag[] {
    const flags: GutFeelingFlag[] = [];

    const allText = [
      ...memories.map((m) => m.content.toLowerCase()),
      context.toLowerCase(),
    ].join(" ");

    // Check drug interactions
    for (const [keyA, keyB, description, confidence] of KNOWN_INTERACTIONS) {
      if (allText.includes(keyA) && allText.includes(keyB)) {
        const related = memories
          .filter((m) => {
            const lower = m.content.toLowerCase();
            return lower.includes(keyA) || lower.includes(keyB);
          })
          .map((m) => m.content);

        flags.push({
          description: `⚠️ Drug Interaction: ${description}`,
          confidence,
          relatedMemories: related,
        });
      }
    }

    // Check escalation patterns
    for (const [keywords, description, confidence] of ESCALATION_PATTERNS) {
      const matchCount = keywords.filter((kw) => allText.includes(kw)).length;
      if (matchCount >= 2) {
        const adjustedConfidence = Math.min(1, confidence * (matchCount / keywords.length));
        const related = memories
          .filter((m) => {
            const lower = m.content.toLowerCase();
            return keywords.some((kw) => lower.includes(kw));
          })
          .map((m) => m.content);

        flags.push({
          description: `🔍 Pattern Alert: ${description}`,
          confidence: adjustedConfidence,
          relatedMemories: related,
        });
      }
    }

    flags.sort((a, b) => b.confidence - a.confidence);
    return flags;
  }
}
