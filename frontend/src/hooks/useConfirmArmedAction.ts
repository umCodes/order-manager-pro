import { useEffect, useRef, useState } from "react";

const COOLDOWN_MS = 1500;
const CONFIRM_WINDOW_MS = 2000;

type Stage = "idle" | "cooldown" | "armed";

/**
 * "Arm, wait, then confirm" click pattern: the first call to `trigger`
 * starts a cooldown during which clicks are ignored (a deliberate pause to
 * reconsider), then opens a short confirm window; a call to `trigger` during
 * that window runs `onConfirm`. Missing the confirm window resets back to
 * idle. Used for destructive/money actions (recording a payment) where a
 * single misclick, or two rapid clicks, shouldn't be enough to submit.
 */
export function useConfirmArmedAction(onConfirm: () => void) {
  const [stage, setStage] = useState<Stage>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function clearArmTimeout() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }

  function disarm() {
    clearArmTimeout();
    setStage("idle");
  }

  function trigger() {
    if (stage === "idle") {
      setStage("cooldown");
      timeoutRef.current = setTimeout(() => {
        setStage("armed");
        timeoutRef.current = setTimeout(() => setStage("idle"), CONFIRM_WINDOW_MS);
      }, COOLDOWN_MS);
      return;
    }
    if (stage === "cooldown") return;
    disarm();
    onConfirm();
  }

  return { isCoolingDown: stage === "cooldown", isArmed: stage === "armed", trigger, disarm };
}
