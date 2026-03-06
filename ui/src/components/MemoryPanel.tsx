import { Brain, AlertCircle, Pill, Stethoscope, ClipboardList } from "lucide-react";
import type { MemoryResult } from "../api";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  condition: <Stethoscope className="w-3.5 h-3.5 text-blue-500" />,
  medication: <Pill className="w-3.5 h-3.5 text-purple-500" />,
  observation: <ClipboardList className="w-3.5 h-3.5 text-slate-500" />,
};

function strengthBar(strength: number) {
  const pct = Math.round(strength * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-teal-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-slate-400 tabular-nums">{pct}%</span>
    </div>
  );
}

interface Props {
  result: MemoryResult;
}

export function MemoryPanel({ result }: Props) {
  const hasFlags = result.gutFeelingFlags && result.gutFeelingFlags.length > 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden animate-fade-in">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2.5">
        <Brain className="w-4 h-4 text-teal-600" />
        <h3 className="text-sm font-semibold text-slate-700">
          Gracestack AI Memory
        </h3>
        <span className="text-[10px] text-slate-400 ml-auto">
          {result.memories.length} memories retrieved
        </span>
      </div>

      {hasFlags && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-semibold text-amber-800">
              Gut Feeling Alerts
            </span>
          </div>
          <div className="space-y-2">
            {result.gutFeelingFlags.map((flag, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="text-xs text-amber-900">{flag.description}</p>
                </div>
                <span className="text-[10px] font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {Math.round(flag.confidence * 100)}% confidence
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {result.memories.map((memory, i) => (
          <div key={i} className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors">
            <span className="shrink-0">
              {CATEGORY_ICONS[memory.category] ?? <ClipboardList className="w-3.5 h-3.5 text-slate-400" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-700 leading-snug truncate">
                {memory.content}
              </p>
            </div>
            <div className="shrink-0">
              {strengthBar(memory.strength)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
