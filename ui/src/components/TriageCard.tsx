import { AlertTriangle, Clock, ShieldAlert, ShieldCheck } from "lucide-react";
import type { TriageResult } from "../api";

const PRIORITY_CONFIG = {
  Critical: {
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "bg-red-600 text-white",
    icon: <ShieldAlert className="w-5 h-5 text-red-600" />,
    pulse: true,
  },
  High: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    badge: "bg-orange-500 text-white",
    icon: <AlertTriangle className="w-5 h-5 text-orange-500" />,
    pulse: false,
  },
  Medium: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-500 text-white",
    icon: <Clock className="w-5 h-5 text-amber-500" />,
    pulse: false,
  },
  Low: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    badge: "bg-emerald-600 text-white",
    icon: <ShieldCheck className="w-5 h-5 text-emerald-600" />,
    pulse: false,
  },
};

interface Props {
  result: TriageResult;
}

export function TriageCard({ result }: Props) {
  const config = PRIORITY_CONFIG[result.priority] ?? PRIORITY_CONFIG.Medium;
  const time = new Date(result.timestamp).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className={`rounded-xl border ${config.border} ${config.bg} p-4 animate-fade-in`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          {config.icon}
          <h3 className="text-sm font-semibold text-slate-800">Triage Assessment</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${config.badge} ${config.pulse ? "animate-pulse" : ""}`}>
            {result.priority}
          </span>
        </div>
      </div>

      <p className="text-sm text-slate-600 leading-relaxed mb-3">
        {result.reasoning}
      </p>

      <div className="flex items-center gap-4 text-[11px] text-slate-400">
        <span>Patient: <span className="font-medium text-slate-600">{result.patientId}</span></span>
        <span>{time}</span>
      </div>
    </div>
  );
}
