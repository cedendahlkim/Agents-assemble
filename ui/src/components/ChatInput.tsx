import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  loading: boolean;
}

const QUICK_SCENARIOS = [
  "Patient Sven Eriksson, 67, chest pain and dizziness. Started ibuprofen for back pain.",
  "Anna Johansson, 42, recurring headaches and fatigue for two weeks.",
  "Erik Lindström, 78, shortness of breath, history of COPD.",
];

export function ChatInput({ onSend, loading }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="p-4">
        <div className="flex gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the patient's symptoms, history, or ask a clinical question..."
            disabled={loading}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 disabled:opacity-60 transition-all"
          />
          <button
            onClick={handleSubmit}
            disabled={loading || !input.trim()}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm self-end"
            aria-label="Send message"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div className="px-4 pb-3 flex flex-wrap gap-2">
        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium self-center mr-1">
          Quick scenarios
        </span>
        {QUICK_SCENARIOS.map((scenario, i) => (
          <button
            key={i}
            onClick={() => {
              setInput(scenario);
              textareaRef.current?.focus();
            }}
            disabled={loading}
            className="text-[11px] px-2.5 py-1 rounded-full border border-slate-200 text-slate-500 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50 transition-all disabled:opacity-40"
          >
            {scenario.length > 50 ? scenario.slice(0, 50) + "…" : scenario}
          </button>
        ))}
      </div>
    </div>
  );
}
