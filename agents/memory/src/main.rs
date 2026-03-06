// LAGER 2 — Agent B: Memory Agent — Frankenstein Core (Port 10021)
// Bride Architecture: Ebbinghaus memory decay + HDC pattern matching + Gut Feeling anomaly detection
//
// Modules:
//   bride::ebbinghaus  — Spaced-repetition memory strength decay
//   bride::hdc         — Hyperdimensional Computing for fuzzy symptom pattern matching
//   bride::gut_feeling — Anomaly detection with confidence scoring

mod bride;

use actix_web::{web, App, HttpServer, HttpResponse, middleware};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

use bride::ebbinghaus::MemoryStore;
use bride::hdc::HdcEncoder;
use bride::gut_feeling::GutFeeling;

// --- Request / Response types ---

#[derive(Debug, Deserialize)]
struct MemoryQueryRequest {
    patient_id: String,
    query_type: String, // "history" | "patterns" | "gut_feeling"
    context: Option<String>,
}

#[derive(Debug, Serialize)]
struct PatientMemoryResponse {
    patient_id: String,
    memories: Vec<MemoryEntry>,
    patterns: Vec<String>,
    gut_feeling_flags: Vec<GutFeelingFlag>,
}

#[derive(Debug, Serialize, Clone)]
struct MemoryEntry {
    content: String,
    strength: f64,
    last_accessed: String,
    category: String,
}

#[derive(Debug, Serialize, Clone)]
struct GutFeelingFlag {
    description: String,
    confidence: f64,
    related_memories: Vec<String>,
}

// --- Ingest request (store new memory) ---

#[derive(Debug, Deserialize)]
struct IngestRequest {
    patient_id: String,
    content: String,
    category: String, // "condition" | "medication" | "observation" | "procedure"
}

#[derive(Debug, Serialize)]
struct IngestResponse {
    status: String,
    memory_id: String,
}

// --- A2A Agent Card ---

#[derive(Debug, Serialize)]
struct AgentCard {
    name: String,
    description: String,
    protocol_version: String,
    version: String,
    url: String,
    skills: Vec<Skill>,
}

#[derive(Debug, Serialize)]
struct Skill {
    id: String,
    name: String,
    description: String,
    tags: Vec<String>,
}

// --- App state ---

struct AppState {
    memory_store: Mutex<MemoryStore>,
    hdc_encoder: Mutex<HdcEncoder>,
    gut_feeling: Mutex<GutFeeling>,
}

// --- Handlers ---

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "agent": "memory-frankenstein",
        "port": 10021
    }))
}

async fn agent_card() -> HttpResponse {
    let card = AgentCard {
        name: "Memory Agent (Frankenstein)".into(),
        description: "Ebbinghaus-based patient memory with HDC pattern matching and Gut Feeling anomaly detection".into(),
        protocol_version: "0.3.0".into(),
        version: "1.0.0".into(),
        url: "http://localhost:10021".into(),
        skills: vec![
            Skill {
                id: "patient-memory".into(),
                name: "Patient Memory".into(),
                description: "Retrieve patient memories with Ebbinghaus decay-weighted relevance".into(),
                tags: vec!["memory".into(), "ebbinghaus".into(), "patient".into()],
            },
            Skill {
                id: "pattern-detection".into(),
                name: "Pattern Detection".into(),
                description: "HDC-based fuzzy matching of symptom patterns across patient history".into(),
                tags: vec!["hdc".into(), "patterns".into(), "symptoms".into()],
            },
            Skill {
                id: "gut-feeling".into(),
                name: "Gut Feeling".into(),
                description: "Anomaly detection flagging unusual combinations with confidence scores".into(),
                tags: vec!["anomaly".into(), "gut-feeling".into(), "safety".into()],
            },
        ],
    };
    HttpResponse::Ok().json(card)
}

async fn query_memory(
    data: web::Data<AppState>,
    body: web::Json<MemoryQueryRequest>,
) -> HttpResponse {
    let patient_id = &body.patient_id;
    let context = body.context.clone().unwrap_or_default();

    let mut store = data.memory_store.lock().unwrap();
    let mut hdc = data.hdc_encoder.lock().unwrap();
    let mut gut = data.gut_feeling.lock().unwrap();

    // Retrieve memories with Ebbinghaus decay applied
    let raw_memories = store.get_memories(patient_id);
    let memories: Vec<MemoryEntry> = raw_memories
        .iter()
        .map(|m| MemoryEntry {
            content: m.content.clone(),
            strength: m.current_strength(),
            last_accessed: m.last_accessed.to_rfc3339(),
            category: m.category.clone(),
        })
        .filter(|m| m.strength > 0.1) // Filter out fully decayed memories
        .collect();

    // HDC pattern detection
    let patterns = if body.query_type == "patterns" || body.query_type == "history" {
        hdc.find_patterns(&memories, &context)
    } else {
        vec![]
    };

    // Gut feeling anomaly detection
    let gut_feeling_flags = if body.query_type == "gut_feeling" || body.query_type == "history" {
        gut.analyze(&memories, &context)
    } else {
        vec![]
    };

    // Touch accessed memories to reinforce them (Ebbinghaus reinforcement)
    store.reinforce_memories(patient_id);

    let response = PatientMemoryResponse {
        patient_id: patient_id.clone(),
        memories,
        patterns,
        gut_feeling_flags,
    };

    HttpResponse::Ok().json(response)
}

async fn ingest_memory(
    data: web::Data<AppState>,
    body: web::Json<IngestRequest>,
) -> HttpResponse {
    let mut store = data.memory_store.lock().unwrap();
    let mut hdc = data.hdc_encoder.lock().unwrap();

    let memory_id = store.add_memory(
        &body.patient_id,
        &body.content,
        &body.category,
    );

    // Encode into HDC space for pattern matching
    hdc.encode_memory(&body.content, &body.category);

    HttpResponse::Ok().json(IngestResponse {
        status: "stored".into(),
        memory_id,
    })
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();
    log::info!("🧠 Memory Agent (Frankenstein) starting on port 10021...");

    let state = web::Data::new(AppState {
        memory_store: Mutex::new(MemoryStore::new()),
        hdc_encoder: Mutex::new(HdcEncoder::new(10_000)), // 10k-dimensional hypervectors
        gut_feeling: Mutex::new(GutFeeling::new()),
    });

    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .route("/health", web::get().to(health))
            .route("/.well-known/agent-card.json", web::get().to(agent_card))
            .route("/a2a/query", web::post().to(query_memory))
            .route("/a2a/ingest", web::post().to(ingest_memory))
    })
    .bind("0.0.0.0:10021")?
    .run()
    .await
}
