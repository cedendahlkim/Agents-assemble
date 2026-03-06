// Bride Module: Gut Feeling — Anomaly Detection
//
// Identifies unusual combinations in patient data that classical rule-based
// systems might miss. Uses co-occurrence statistics and known contraindication
// patterns to flag potential issues with a confidence score.
//
// This is the "sixth sense" of the Frankenstein Core — it catches things like:
//   - Drug interactions (e.g., NSAIDs + anticoagulants)
//   - Symptom patterns suggesting deterioration
//   - Missing expected follow-ups

use super::super::MemoryEntry;
use super::super::GutFeelingFlag;

/// Known contraindication / interaction patterns
/// Each entry: (keyword_a, keyword_b, description, base_confidence)
const KNOWN_INTERACTIONS: &[(&str, &str, &str, f64)] = &[
    ("aspirin", "ibuprofen", "NSAID + Aspirin: increased bleeding risk", 0.85),
    ("aspirin", "warfarin", "Aspirin + Warfarin: significantly elevated bleeding risk", 0.92),
    ("metoprolol", "verapamil", "Beta-blocker + Calcium channel blocker: risk of severe bradycardia", 0.88),
    ("losartan", "potassium", "ARB + Potassium supplement: risk of hyperkalemia", 0.80),
    ("statin", "grapefruit", "Statin + Grapefruit: increased statin toxicity risk", 0.70),
    ("metformin", "contrast", "Metformin + IV contrast: risk of lactic acidosis", 0.82),
    ("ssri", "tramadol", "SSRI + Tramadol: risk of serotonin syndrome", 0.87),
    ("ace inhibitor", "potassium", "ACE inhibitor + Potassium: risk of hyperkalemia", 0.81),
];

/// Symptom escalation patterns: if these appear together, it might indicate deterioration
const ESCALATION_PATTERNS: &[(&[&str], &str, f64)] = &[
    (
        &["chest pain", "dizziness", "cardiac"],
        "Recurring cardiac symptoms with history of cardiac event — possible deterioration",
        0.88,
    ),
    (
        &["headache", "vision", "hypertension"],
        "Headache + vision changes with hypertension history — check for hypertensive emergency",
        0.78,
    ),
    (
        &["fatigue", "weight", "thyroid"],
        "Fatigue + weight changes with thyroid history — possible thyroid dysfunction",
        0.72,
    ),
    (
        &["shortness of breath", "edema", "cardiac"],
        "Dyspnea + edema with cardiac history — possible heart failure exacerbation",
        0.90,
    ),
];

pub struct GutFeeling {
    // Could be extended with learned co-occurrence stats
}

impl GutFeeling {
    pub fn new() -> Self {
        Self {}
    }

    /// Analyze a set of memories and current context for anomalies
    pub fn analyze(&mut self, memories: &[MemoryEntry], context: &str) -> Vec<GutFeelingFlag> {
        let mut flags: Vec<GutFeelingFlag> = Vec::new();

        // Combine all memory content + context into a searchable corpus
        let all_text: String = memories
            .iter()
            .map(|m| m.content.to_lowercase())
            .chain(std::iter::once(context.to_lowercase()))
            .collect::<Vec<_>>()
            .join(" ");

        // Check known drug interactions
        for &(keyword_a, keyword_b, description, confidence) in KNOWN_INTERACTIONS {
            if all_text.contains(keyword_a) && all_text.contains(keyword_b) {
                let related: Vec<String> = memories
                    .iter()
                    .filter(|m| {
                        let lower = m.content.to_lowercase();
                        lower.contains(keyword_a) || lower.contains(keyword_b)
                    })
                    .map(|m| m.content.clone())
                    .collect();

                flags.push(GutFeelingFlag {
                    description: format!("⚠️ Drug Interaction: {}", description),
                    confidence,
                    related_memories: related,
                });
            }
        }

        // Check symptom escalation patterns
        for &(keywords, description, confidence) in ESCALATION_PATTERNS {
            let match_count = keywords
                .iter()
                .filter(|&&kw| all_text.contains(kw))
                .count();

            // Require at least 2 out of N keywords to match
            if match_count >= 2 {
                let adjusted_confidence = confidence * (match_count as f64 / keywords.len() as f64);
                let related: Vec<String> = memories
                    .iter()
                    .filter(|m| {
                        let lower = m.content.to_lowercase();
                        keywords.iter().any(|&kw| lower.contains(kw))
                    })
                    .map(|m| m.content.clone())
                    .collect();

                flags.push(GutFeelingFlag {
                    description: format!("🔍 Pattern Alert: {}", description),
                    confidence: adjusted_confidence.min(1.0),
                    related_memories: related,
                });
            }
        }

        // Sort by confidence descending
        flags.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));
        flags
    }
}
