"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { signOut } from "next-auth/react";

const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
const WARN_BEFORE_MS = 5 * 60 * 1000;

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"] as const;

export function IdleLogout() {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(WARN_BEFORE_MS / 1000);

  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const doLogout = useCallback(() => {
    signOut({ callbackUrl: "/login" });
  }, []);

  const resetTimers = useCallback(() => {
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);

    setShowWarning(false);
    setCountdown(WARN_BEFORE_MS / 1000);

    warnTimer.current = setTimeout(() => {
      setShowWarning(true);
      let secs = WARN_BEFORE_MS / 1000;
      countdownInterval.current = setInterval(() => {
        secs -= 1;
        setCountdown(secs);
        if (secs <= 0 && countdownInterval.current) {
          clearInterval(countdownInterval.current);
        }
      }, 1000);
    }, IDLE_TIMEOUT_MS - WARN_BEFORE_MS);

    logoutTimer.current = setTimeout(doLogout, IDLE_TIMEOUT_MS);
  }, [doLogout]);

  useEffect(() => {
    resetTimers();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetTimers, { passive: true }));
    return () => {
      if (logoutTimer.current) clearTimeout(logoutTimer.current);
      if (warnTimer.current) clearTimeout(warnTimer.current);
      if (countdownInterval.current) clearInterval(countdownInterval.current);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimers));
    };
  }, [resetTimers]);

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl text-center space-y-4">
        <p className="text-lg font-semibold text-slate-100">Session expiring soon</p>
        <p className="text-sm text-slate-400">
          You will be signed out in{" "}
          <span className="font-semibold text-cyan-300">{countdown}</span> second
          {countdown !== 1 ? "s" : ""} due to inactivity.
        </p>
        <button
          onClick={resetTimers}
          className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-cyan-400"
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800 hover:text-rose-400"
    >
      Sign out
    </button>
  );
}
