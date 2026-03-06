import { useEffect, useState } from "react";
import { CircleCheck, CircleX, RefreshCw, Brain, Stethoscope, FileHeart } from "lucide-react";
import { fetchAgents, type AgentStatus } from "../api";

const AGENT_ICONS: Record<string, React.ReactNode> = {
  "Triage Agent": <Stethoscope className="w-3.5 h-3.5" />,
  "Memory Agent (Gracestack AI)": <Brain className="w-3.5 h-3.5" />,
  "FHIR Agent": <FileHeart className="w-3.5 h-3.5" />,
};

export function AgentStatusBar() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await fetchAgents();
      setAgents(data);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  const onlineCount = agents.filter((a) => a.status === "online").length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700">Agent Network</h2>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-slate-400 hover:text-teal-600 transition-colors disabled:opacity-50"
          aria-label="Refresh agent status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex items-center gap-1.5 mb-3">
        <div className={`w-2 h-2 rounded-full ${onlineCount === agents.length && agents.length > 0 ? "bg-emerald-500" : onlineCount > 0 ? "bg-amber-500" : "bg-red-500"}`} />
        <span className="text-xs text-slate-500">
          {onlineCount}/{agents.length || 3} agents online
        </span>
      </div>

      <div className="space-y-2">
        {agents.map((agent) => (
          <div
            key={agent.name}
            className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-slate-50"
          >
            <div className="flex items-center gap-2">
              <span className="text-slate-500">
                {AGENT_ICONS[agent.name] ?? <Brain className="w-3.5 h-3.5" />}
              </span>
              <div>
                <span className="text-xs font-medium text-slate-700 block leading-tight">
                  {agent.name}
                </span>
                <span className="text-[10px] text-slate-400">:{agent.port}</span>
              </div>
            </div>
            {agent.status === "online" ? (
              <CircleCheck className="w-4 h-4 text-emerald-500" />
            ) : (
              <CircleX className="w-4 h-4 text-red-400" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
