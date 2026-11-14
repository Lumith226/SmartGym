'use client';

import * as React from 'react';
import { RotateCcw, Check } from 'lucide-react';
import { Button } from './ui/button';

export function WorkoutSetTracker({
  levelSets,
  restSeconds,
}: {
  levelSets: [number, number, number];
  restSeconds?: number;
}) {
  const restDuration = restSeconds ?? 0;
  const [currentLevel, setCurrentLevel] = React.useState<0 | 1 | 2>(0);
  const totalSets = levelSets[currentLevel];
  const [completedSets, setCompletedSets] = React.useState(0);
  const [timerRunning, setTimerRunning] = React.useState(false);
  const [timeLeft, setTimeLeft] = React.useState(restDuration);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            setTimerRunning(false);
            return restDuration;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerRunning, timeLeft, restDuration]);

  const toggleSet = (idx: number) => {
    if (idx < completedSets) {
      setCompletedSets(idx);
    } else {
      setCompletedSets(idx + 1);
      setTimeLeft(restDuration);
      setTimerRunning(restDuration > 0);
    }
  };

  const resetAll = () => {
    setCompletedSets(0);
    setTimerRunning(false);
    setTimeLeft(restDuration);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary">
          {restDuration > 0 ? 'Đếm hiệp và nghỉ' : 'Đếm hiệp'}
        </span>
        <div className="flex gap-1">
          {(['I', 'II', 'III'] as const).map((lvl, idx) => (
            <button
              key={lvl}
              type="button"
              onClick={() => {
                setCurrentLevel(idx as 0 | 1 | 2);
                setCompletedSets(0);
              }}
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                currentLevel === idx
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Cấp {lvl} ({levelSets[idx]} hiệp)
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {Array.from({ length: totalSets }).map((_, idx) => {
          const done = idx < completedSets;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => toggleSet(idx)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold transition-all ${
                done
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:border-primary/50'
              }`}
              aria-label={`Hiệp ${idx + 1}`}
            >
              {done ? <Check size={14} strokeWidth={3} /> : idx + 1}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs">
        {restDuration > 0 && <span className="font-mono text-muted-foreground">
          {timerRunning ? `Nghỉ: ${timeLeft}s` : `Nghỉ giữa hiệp: ${restDuration}s`}
        </span>}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={resetAll}
            className="h-7 px-2 text-xs"
          >
            <RotateCcw size={12} className="mr-1" /> Đặt lại
          </Button>
        </div>
      </div>
    </div>
  );
}
