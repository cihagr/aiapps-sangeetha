import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

// Global session timeout based on user inactivity
// Listens to common user interaction events and resets the timer.
// After timeout, shows a toast and redirects to /login.
export default function SessionTimeout({ timeoutMs = 60_000 }: { timeoutMs?: number }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Do not trigger timeout on the login/register routes to avoid loops
  const isAuthRoute = location.pathname === "/login" || location.pathname === "/register";

  useEffect(() => {
    if (isAuthRoute) {
      // Clear any existing timer if on auth pages
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // Optional: clear any auth storage keys here if you use them
        // localStorage.removeItem('token');
        // sessionStorage.clear();
        toast({
          title: "Session expired",
          description: `You were inactive for ${Math.round(timeoutMs / 1000)} seconds. Please sign in again.`,
          variant: "destructive",
        });
        const issso=sessionStorage.getItem('isSSO')
        if(issso!='true')
          navigate("/login");
      }, timeoutMs);
    };

    // Events that indicate activity
    const windowEvents: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "wheel",
    ];

    const onActivity = () => {
      // Reset only if page is visible to avoid background tab resets
      if (document.visibilityState === "visible") {
        resetTimer();
      }
    };

    windowEvents.forEach((evt) => window.addEventListener(evt, onActivity, { passive: true } as any));
    // Also track visibility changes on the document to avoid resetting timer when tab is hidden
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        resetTimer();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Start initial timer
    resetTimer();

    return () => {
      windowEvents.forEach((evt) => window.removeEventListener(evt, onActivity as any));
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [navigate, toast, timeoutMs, isAuthRoute]);

  return null;
}
