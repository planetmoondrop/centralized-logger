import { useState, useCallback } from 'react';

export type LogType = 'info' | 'success' | 'error' | 'trace';

export interface LogEntry {
  id: number;
  time: string;
  msg: string;
  type: LogType;
}

let _id = 0;

export function useActivityLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  const log = useCallback((msg: string, type: LogType = 'info') => {
    const now = new Date();
    const time = now.toTimeString().slice(0, 8); // HH:MM:SS
    setEntries((prev) => [{ id: _id++, time, msg, type }, ...prev]);
  }, []);

  return { entries, log };
}
