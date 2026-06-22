"use client";

import { useEffect } from "react";

/** Returns true if focus is currently in a text input / editable area. */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

export interface KeyboardNavHandlers {
  onPrev?: () => void;
  onNext?: () => void;
  onToggleAnswer?: () => void;
  enabled?: boolean;
}

/**
 * Study keyboard shortcuts:
 *  - ArrowLeft / k  -> previous question
 *  - ArrowRight / j -> next question
 *  - Space / Enter  -> toggle the current answer
 * Disabled while typing in an input/textarea.
 */
export function useKeyboardNav({
  onPrev,
  onNext,
  onToggleAnswer,
  enabled = true,
}: KeyboardNavHandlers) {
  useEffect(() => {
    if (!enabled) return;
    function handler(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      switch (e.key) {
        case "ArrowLeft":
        case "k":
          if (onPrev) {
            e.preventDefault();
            onPrev();
          }
          break;
        case "ArrowRight":
        case "j":
          if (onNext) {
            e.preventDefault();
            onNext();
          }
          break;
        case " ":
        case "Enter":
          if (onToggleAnswer) {
            e.preventDefault();
            onToggleAnswer();
          }
          break;
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPrev, onNext, onToggleAnswer, enabled]);
}
