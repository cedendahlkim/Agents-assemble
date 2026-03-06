import { useState, useRef, useEffect } from "react";
import { Header } from "./components/Header";
import { AgentStatusBar } from "./components/AgentStatusBar";
import { ChatInput } from "./components/ChatInput";
import { TriageCard } from "./components/TriageCard";
import { MemoryPanel } from "./components/MemoryPanel";
import { ResponseCard } from "./components/ResponseCard";
import { ThinkingIndicator } from "./components/ThinkingIndicator";
import AgentActivityLog from "./components/AgentActivityLog";
import { orchestrate, type OrchestrationResponse } from "./api";
import { MessageSquare, Shield, Trash2 } from "lucide-react";

interface HistoryEntry {
  id: string;
  query: string;
  result: OrchestrationResponse;
  timestamp: Date;
}

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const resultsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    resultsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, loading]);

  const handleSend = async (message: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await orchestrate(message);
      setHistory((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          query: message,
          result,
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          {/* Main content area */}
          <div className="space-y-5 min-w-0">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <ChatInput onSend={handleSend} loading={loading} />
              </div>
              {history.length > 0 && (
                <button
                  onClick={() => setHistory([])}
                  className="shrink-0 mb-px p-2.5 rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors"
                  title="Rensa chatthistorik"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-fade-in">
                <strong>Error:</strong> {error}
              </div>
            )}

            {history.length === 0 && !loading && (
              <div className="text-center py-16 animate-fade-in">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-50 mb-4">
                  <Shield className="w-8 h-8 text-teal-500" />
                </div>
                <h2 className="text-lg font-semibold text-slate-700 mb-2">
                  Welcome to Gracestack AI
                </h2>
                <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                  Enter a clinical scenario above and our multi-agent system will provide
                  triage assessment, patient memory analysis, and a synthesized clinical summary.
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-6 text-[11px] text-slate-400">
                  <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200">
                    Ebbinghaus Memory Decay
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200">
                    HDC Pattern Matching
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200">
                    Gut Feeling Anomaly Detection
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200">
                    FHIR R4 Integration
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200">
                    A2A Protocol v0.3
                  </span>
                </div>
              </div>
            )}

            {history.map((entry) => (
              <div key={entry.id} className="space-y-4 animate-fade-in">
                {/* User query */}
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-200 shrink-0 mt-0.5">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-600" />
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
                    <p className="text-sm text-slate-700">{entry.query}</p>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      {entry.timestamp.toLocaleTimeString("sv-SE")}
                    </span>
                  </div>
                </div>

                {/* Triage + Memory side by side on larger screens */}
                {(entry.result.triageResult || entry.result.memoryResult) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-10">
                    {entry.result.triageResult && (
                      <TriageCard result={entry.result.triageResult} />
                    )}
                    {entry.result.memoryResult && (
                      <div className="md:col-span-1">
                        <MemoryPanel result={entry.result.memoryResult} />
                      </div>
                    )}
                  </div>
                )}

                {/* AI Summary */}
                <div className="pl-10">
                  <ResponseCard
                    response={entry.result.response}
                    agentsUsed={entry.result.agentsUsed}
                  />
                </div>

                <hr className="border-slate-200" />
              </div>
            ))}

            {loading && (
              <div className="pl-10">
                <ThinkingIndicator />
              </div>
            )}

            <div ref={resultsEndRef} />
          </div>

          {/* Right sidebar — desktop */}
          <aside className="hidden lg:block space-y-4">
            <AgentStatusBar />
            <AgentActivityLog />

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">About</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Gracestack AI is a multi-agent clinical decision support
                system built on the A2A protocol. It combines Ebbinghaus memory
                decay, hyperdimensional computing, and anomaly detection to
                provide intelligent patient insights.
              </p>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="text-[10px] text-slate-400 space-y-1">
                  <div className="flex justify-between">
                    <span>Protocol</span>
                    <span className="font-medium text-slate-600">A2A v0.3 + MCP</span>
                  </div>
                  <div className="flex justify-between">
                    <span>LLM</span>
                    <span className="font-medium text-slate-600">Gemini 2.5 Flash</span>
                  </div>
                  <div className="flex justify-between">
                    <span>FHIR</span>
                    <span className="font-medium text-slate-600">R4</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Mobile: Agent Activity + Status below main content */}
        <div className="lg:hidden mt-6 space-y-4">
          <AgentStatusBar />
          <AgentActivityLog />
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            &copy; {new Date().getFullYear()} Gracestack &mdash; Healthcare AI
          </span>
          <span className="text-[11px] text-slate-400">
            Agents Assemble Hackathon
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
