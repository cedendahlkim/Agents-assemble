import { useEffect, useState, useRef } from 'react';
import { Activity, AlertTriangle, ArrowRight, CheckCircle } from 'lucide-react';

interface AgentEvent {
  timestamp: string;
  from: string;
  to: string;
  message: string;
  type: 'call' | 'response' | 'flag';
}

export default function AgentActivityLog() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource('/api/agent-stream');
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const event: AgentEvent = JSON.parse(e.data);
        setEvents((prev) => [...prev.slice(-49), event]);
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const typeIcon = (type: AgentEvent['type']) => {
    switch (type) {
      case 'call': return <ArrowRight className="w-3.5 h-3.5 text-blue-400" />;
      case 'response': return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
      case 'flag': return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
    }
  };

  const typeBg = (type: AgentEvent['type']) => {
    switch (type) {
      case 'call': return 'border-l-blue-400/50';
      case 'response': return 'border-l-emerald-400/50';
      case 'flag': return 'border-l-amber-400/50 bg-amber-950/20';
    }
  };

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return ''; }
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">Agent Activity</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          <span className="text-xs text-gray-400">{connected ? 'Live' : 'Disconnected'}</span>
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto p-2 space-y-1 font-mono text-xs">
        {events.length === 0 && (
          <p className="text-gray-500 text-center py-6">Waiting for agent activity...</p>
        )}
        {events.map((event, i) => (
          <div key={i} className={`flex items-start gap-2 px-2 py-1.5 rounded border-l-2 ${typeBg(event.type)}`}>
            <span className="text-gray-500 shrink-0 w-16">{formatTime(event.timestamp)}</span>
            {typeIcon(event.type)}
            <div className="min-w-0">
              <span className="text-cyan-300">{event.from}</span>
              <span className="text-gray-500 mx-1">→</span>
              <span className="text-purple-300">{event.to}</span>
              <p className="text-gray-300 truncate mt-0.5">{event.message}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
