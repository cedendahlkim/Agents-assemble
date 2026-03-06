import { Bot, CheckCircle2 } from "lucide-react";

interface Props {
  response: string;
  agentsUsed: string[];
}

export function ResponseCard({ response, agentsUsed }: Props) {
  const sections = response.split("\n").filter((l) => l.trim());

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-5 animate-fade-in">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-teal-600">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800">
          Gracestack AI Clinical Summary
        </h3>
      </div>

      <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed space-y-2 mb-4">
        {sections.map((line, i) => {
          if (line.startsWith("**") && line.endsWith("**")) {
            return (
              <h4 key={i} className="text-xs font-bold text-slate-900 uppercase tracking-wide mt-3 mb-1">
                {line.replace(/\*\*/g, "")}
              </h4>
            );
          }
          if (line.startsWith("*") || line.startsWith("-")) {
            return (
              <div key={i} className="flex items-start gap-2 pl-1">
                <span className="text-teal-500 mt-0.5">&#8226;</span>
                <span
                  className="text-sm"
                  dangerouslySetInnerHTML={{
                    __html: line
                      .replace(/^[*-]\s*/, "")
                      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-900">$1</strong>'),
                  }}
                />
              </div>
            );
          }
          return (
            <p
              key={i}
              className="text-sm"
              dangerouslySetInnerHTML={{
                __html: line.replace(
                  /\*\*(.+?)\*\*/g,
                  '<strong class="text-slate-900">$1</strong>'
                ),
              }}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-teal-200/60">
        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
        <span className="text-[11px] text-slate-500">
          Powered by{" "}
          {agentsUsed.map((a, i) => (
            <span key={a}>
              <span className="font-medium text-teal-700">{a}</span>
              {i < agentsUsed.length - 1 ? ", " : ""}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
