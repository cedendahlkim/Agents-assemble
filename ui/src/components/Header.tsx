import { Activity, Shield } from "lucide-react";

export function Header() {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-linear-to-br from-teal-500 to-teal-700 shadow-sm">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 leading-tight tracking-tight">
                Gracestack <span className="text-teal-600">AI</span>
              </h1>
              <p className="text-[11px] text-slate-500 leading-none -mt-0.5">
                Clinical Decision Support
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Activity className="w-3.5 h-3.5 text-teal-500" />
            <span>Multi-Agent Healthcare System</span>
          </div>
        </div>
      </div>
    </header>
  );
}
