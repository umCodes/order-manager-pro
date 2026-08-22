import { useEffect, useRef, useState } from "react";

const CONFIRM_WINDOW_MS = 2000;

/**
 * "Arm, then confirm" click pattern: the first call to `trigger` arms the
 * action and auto-disarms after a short window; a second call within that
 * window runs `onConfirm`. Used for destructive/money actions (recording a
 * payment) where a single misclick shouldn't be enough to submit.
 */
export function useConfirmArmedAction(onConfirm: () => void) {
  const [isArmed, setIsArmed] = useState(false);
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
    setIsArmed(false);
  }

  function trigger() {
    if (!isArmed) {
      setIsArmed(true);
      timeoutRef.current = setTimeout(() => setIsArmed(false), CONFIRM_WINDOW_MS);
      return;
    }
    disarm();
    onConfirm();
  }

  return { isArmed, trigger, disarm };
}
