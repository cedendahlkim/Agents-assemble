// Bride Module: Ebbinghaus — Spaced Repetition Memory Decay
//
// Implements the Ebbinghaus forgetting curve: R = e^(-t/S)
// where R = retention, t = time since last review, S = memory stability
//
// Medical memories that are reinforced (accessed) decay slower.
// Critical findings (e.g. cardiac events) get a stability bonus.

use chrono::{DateTime, Utc};
use serde::Serialize;
use std::collections::HashMap;
use uuid::Uuid;

const BASE_STABILITY: f64 = 72.0; // Base stability in hours
const REINFORCEMENT_FACTOR: f64 = 1.5; // Each reinforcement multiplies stability
const CRITICAL_BONUS: f64 = 2.0; // Critical categories get extra stability
const DECAY_THRESHOLD: f64 = 0.05; // Below this, memory is considered forgotten

#[derive(Debug, Clone, Serialize)]
pub struct Memory {
    pub id: String,
    pub patient_id: String,
    pub content: String,
    pub category: String,
    pub created_at: DateTime<Utc>,
    pub last_accessed: DateTime<Utc>,
    pub stability: f64,       // S — how resistant to forgetting (hours)
    pub access_count: u32,    // Number of times this memory was reinforced
}

impl Memory {
    pub fn new(patient_id: &str, content: &str, category: &str) -> Self {
        let stability = if is_critical_category(category) {
            BASE_STABILITY * CRITICAL_BONUS
        } else {
            BASE_STABILITY
        };

        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            patient_id: patient_id.to_string(),
            content: content.to_string(),
            category: category.to_string(),
            created_at: now,
            last_accessed: now,
            stability,
            access_count: 0,
        }
    }

    /// Calculate current retention strength using Ebbinghaus forgetting curve
    /// R = e^(-t/S) where t = hours since last access, S = stability
    pub fn current_strength(&self) -> f64 {
        let hours_elapsed = Utc::now()
            .signed_duration_since(self.last_accessed)
            .num_minutes() as f64
            / 60.0;

        let retention = (-hours_elapsed / self.stability).exp();
        retention.max(0.0).min(1.0)
    }

    /// Reinforce this memory (spaced repetition)
    pub fn reinforce(&mut self) {
        self.last_accessed = Utc::now();
        self.access_count += 1;
        self.stability *= REINFORCEMENT_FACTOR;
    }

    pub fn is_forgotten(&self) -> bool {
        self.current_strength() < DECAY_THRESHOLD
    }
}

fn is_critical_category(category: &str) -> bool {
    matches!(category, "condition" | "procedure")
}

/// In-memory patient memory store with Ebbinghaus decay
pub struct MemoryStore {
    // patient_id -> Vec<Memory>
    memories: HashMap<String, Vec<Memory>>,
}

impl MemoryStore {
    pub fn new() -> Self {
        let mut store = Self {
            memories: HashMap::new(),
        };
        // Seed demo data for showcase
        store.seed_demo_data();
        store
    }

    pub fn add_memory(&mut self, patient_id: &str, content: &str, category: &str) -> String {
        let memory = Memory::new(patient_id, content, category);
        let id = memory.id.clone();
        self.memories
            .entry(patient_id.to_string())
            .or_default()
            .push(memory);
        id
    }

    pub fn get_memories(&mut self, patient_id: &str) -> Vec<Memory> {
        self.memories
            .get(patient_id)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|m| !m.is_forgotten())
            .collect()
    }

    /// Reinforce all memories for a patient (simulates clinical review)
    pub fn reinforce_memories(&mut self, patient_id: &str) {
        if let Some(memories) = self.memories.get_mut(patient_id) {
            for m in memories.iter_mut() {
                m.reinforce();
            }
        }
    }

    /// Seed demo data so the hackathon demo has something to show
    fn seed_demo_data(&mut self) {
        // Patient "sven-eriksson" — previous cardiac history
        let demo_patient = "sven-eriksson";

        self.add_memory(
            demo_patient,
            "Myocardial infarction (STEMI) treated with PCI — March 2023",
            "condition",
        );
        self.add_memory(
            demo_patient,
            "Hypertension diagnosed — ongoing since 2019, managed with Losartan 50mg",
            "condition",
        );
        self.add_memory(
            demo_patient,
            "Aspirin 75mg daily — prescribed post-MI 2023",
            "medication",
        );
        self.add_memory(
            demo_patient,
            "Atorvastatin 40mg daily — cholesterol management",
            "medication",
        );
        self.add_memory(
            demo_patient,
            "Metoprolol 50mg x2 — beta blocker post-MI",
            "medication",
        );
        self.add_memory(
            demo_patient,
            "Follow-up echocardiogram — EF 45%, mild LV dysfunction — June 2023",
            "observation",
        );
        self.add_memory(
            demo_patient,
            "Reported intermittent dizziness during exercise — September 2024",
            "observation",
        );
        self.add_memory(
            demo_patient,
            "Blood pressure well controlled at 130/82 — last visit January 2025",
            "observation",
        );

        // Reinforce critical memories so they're strong during demo
        if let Some(memories) = self.memories.get_mut(demo_patient) {
            for m in memories.iter_mut() {
                m.reinforce();
                m.reinforce(); // Double reinforce for demo stability
            }
        }
    }
}
