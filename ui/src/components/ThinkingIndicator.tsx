import { Loader2 } from "lucide-react";

export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 animate-fade-in">
      <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-slate-500">Analyzing with Gracestack AI agents</span>
        <div className="flex gap-1 ml-1">
          <div className="w-1.5 h-1.5 rounded-full bg-teal-500 thinking-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-teal-500 thinking-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-teal-500 thinking-dot" />
        </div>
      </div>
    </div>
  );
}
