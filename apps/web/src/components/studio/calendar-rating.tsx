import * as React from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { motionTokens } from "@/components/arc/lib/motion-tokens";

export function CalendarRating({
  value,
  mode,
}: {
  value: number | null;
  mode: "sleep" | "day";
}) {
  const reduced = useReducedMotion();
  const counter = useMotionValue(value ?? 0);
  const text = useTransform(counter, (n) => `${Math.round(n)}/100`);
  React.useEffect(() => {
    const animation = animate(
      counter,
      value ?? 0,
      reduced ? { duration: 0 } : motionTokens.spring.smooth
    );
    return () => animation.stop();
  }, [counter, value, reduced]);
  return (
    <div className={`month-index ${mode === "day" ? "day" : ""}`}>
      <span>{mode === "sleep" ? "Индекс сна" : "Индекс дня"}</span>
      {value === null ? (
        <span title="Нет дневной оценки">—</span>
      ) : (
        <motion.span>{text}</motion.span>
      )}
      <div className="calendar-rating-track" aria-hidden="true">
        <motion.i
          initial={false}
          animate={{
            scaleX: (value ?? 0) / 100,
            opacity: value === null ? 0 : 1,
          }}
          transition={reduced ? { duration: 0 } : motionTokens.spring.smooth}
        />
      </div>
    </div>
  );
}
