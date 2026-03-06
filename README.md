# Gracestack AI — Healthcare Multi-Agent Clinical Decision Support

> **Agents Assemble Hackathon** | by **Gracestack**
> A multi-agent system that combines memory science, pattern recognition, and anomaly detection to support clinical decision-making.

## What makes Gracestack AI different

Most clinical decision tools treat every patient visit in isolation. **Gracestack AI** remembers.

Our Memory Agent uses three cognitive-inspired modules to build a living picture of each patient:

| Module | Inspiration | Clinical Value |
| --- | --- | --- |
| **Ebbinghaus** | Forgetting curve (`R = e^(-t/S)`) | Critical findings stay active; routine data naturally fades — just like a clinician's recall |
| **HDC** | Hyperdimensional Computing (10 000-d vectors) | Fuzzy matching across symptoms — "chest pain" correlates with "thoracic discomfort" |
| **Gut Feeling** | Anomaly detection | Flags drug interactions (e.g. NSAID + Aspirin) and symptom escalation patterns automatically |

## Architecture

```text
┌─────────────────────────────────────────────────────┐
│  Gracestack AI Dashboard  (React + Tailwind)        │
│  http://localhost:5173                               │
└────────────────────────┬────────────────────────────┘
                         │ REST
┌────────────────────────▼────────────────────────────┐
│  Orchestration Agent         Port 10030             │
│  Gemini 2.5 Flash · Intent → Delegate → Synthesize │
└───────┬──────────────┬──────────────┬───────────────┘
        │ A2A          │ HTTP/JSON    │ A2A
        ▼              ▼              ▼
┌────────────┐ ┌────────────────┐ ┌────────────┐
│ Triage     │ │ Memory Agent   │ │ FHIR Agent │
│ Port 10020 │ │ Port 10021     │ │ Port 10028 │
│ Gemini LLM │ │ Gracestack AI  │ │ FHIR R4    │
│            │ │ ┌────────────┐ │ │            │
│ Symptom →  │ │ │ Ebbinghaus │ │ │ Read/Write │
│ Priority   │ │ │ HDC        │ │ │ journals   │
│            │ │ │ Gut Feeling│ │ │            │
└────────────┘ │ └────────────┘ │ └────────────┘
               └────────────────┘
                       │
               ┌───────▼───────┐
               │ FHIR MCP      │
               │ hapi.fhir.org │
               └───────────────┘
```

## Quick Start

### Prerequisites

- Node.js 22+
- Google Gemini API key

### 1. Install

```bash
cd agents-assemble
npm install
cd ui && npm install && cd ..
```

### 2. Configure

```bash
cp .env.example .env
# Add your GEMINI_API_KEY to .env
```

### 3. Start all agents

```bash
# Terminal 1 — all backend agents
npm run start:all

# Terminal 2 — UI dashboard
cd ui && npm run dev
```

Open **http://localhost:5173** in your browser.

### Docker (alternative)

```bash
export GEMINI_API_KEY=your-key-here
docker compose up --build
```

## Demo Scenario

Open the Gracestack AI dashboard and try these scenarios:

**Scenario 1 — Triage + Memory + Gut Feeling:**

> Patient Sven Eriksson, 67 years old, reports chest pain and dizziness. He also started taking ibuprofen for back pain.

Expected result:
- **Triage:** Critical priority (chest pain + dizziness in elderly)
- **Memory:** 8 historical records including previous MI (2023), current medications
- **Gut Feeling:** NSAID + Aspirin bleeding risk flag (85% confidence)
- **Synthesis:** Complete clinical summary with actionable recommendations

**Scenario 2 — New patient:**

> Anna Johansson, 42, recurring headaches and fatigue for two weeks.

**Scenario 3 — Respiratory:**

> Erik Lindström, 78, shortness of breath, history of COPD.

## API Endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `POST /orchestrate` | POST | Natural language clinical queries |
| `GET /agents` | GET | Agent discovery with online/offline status |
| `GET /health` | GET | Health check (each agent has its own) |

## Project Structure

```text
agents-assemble/
├── ui/                            # React dashboard (Vite + Tailwind CSS v4)
│   └── src/
│       ├── App.tsx                # Main dashboard layout
│       ├── api.ts                 # API client
│       └── components/            # Header, ChatInput, TriageCard, MemoryPanel, etc.
├── agents/
│   ├── triage/index.ts            # Triage Agent (A2A, Gemini, port 10020)
│   ├── fhir/index.ts              # FHIR Agent (A2A, port 10028)
│   └── memory/                    # Memory Agent — Gracestack AI (port 10021)
│       ├── index.ts               # Express server with A2A endpoints
│       └── bride/                 # Gracestack cognitive modules
│           ├── ebbinghaus.ts      # Memory decay (R = e^(-t/S))
│           ├── hdc.ts             # Hyperdimensional Computing (10 000-d)
│           └── gut-feeling.ts     # Anomaly detection
├── orchestration/
│   └── cascade.ts                 # Orchestration Agent (Gemini, port 10030)
├── mcp/
│   └── healthcare-server.ts       # FHIR MCP Server (stdio)
├── shared/
│   ├── types.ts                   # Shared TypeScript types
│   ├── fhir-client.ts             # FHIR R4 HTTP client
│   └── llm-utils.ts              # Gemini JSON parsing utilities
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

## Tech Stack

| Component | Technology |
| --- | --- |
| Frontend | React 19 + Tailwind CSS v4 + Lucide Icons |
| Agent Protocol | [A2A (Agent-to-Agent)](https://github.com/a2aproject/a2a-js) v0.3.0 |
| Tool Protocol | [MCP (Model Context Protocol)](https://modelcontextprotocol.io) |
| LLM | Google Gemini 2.5 Flash |
| FHIR | hapi.fhir.org R4 test server |
| Runtime | TypeScript + Express + tsx |
| Containerization | Docker Compose |

## License

Hackathon project — Agents Assemble 2026 — by **Gracestack**
