import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch, SessionUser } from "@/lib/api";

interface AuthState {
  loading: boolean;
  user: SessionUser | null;
  refresh: () => Promise<void>;
  /** Drop the cached session after a request comes back 401. The routing layouts
   *  watch `user`, so clearing it is what sends the host to the sign-in screen —
   *  screens do not navigate themselves. */
  clearSession: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await apiFetch<{ user: SessionUser }>("/api/mobile/v1/session");
      setUser(result.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const clearSession = useCallback(() => {
    setUser(null);
    setLoading(false);
  }, []);

  const value = useMemo(
    () => ({ loading, user, refresh, clearSession }),
    [clearSession, loading, refresh, user]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
