import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchMe, clearAuthToken, getAuthToken } from '../api/client';
import type { AuthUser, OrgRole } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  logout: () => void;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  logout: () => undefined,
  refetch: async () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const logout = useCallback(() => {
    clearAuthToken();
    setUser(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    window.location.reload();
  }, []);

  const refetch = useCallback(async () => {
    if (!getAuthToken()) { setUser(null); setLoading(false); return; }
    try {
      const { user: me } = await fetchMe();
      setUser(me);
    } catch {
      // 401 → token expired or user deactivated
      setUser(null);
      clearAuthToken();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
    // Poll every 60 seconds so role changes take effect without re-login
    intervalRef.current = setInterval(() => { void refetch(); }, 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refetch]);

  return (
    <AuthContext.Provider value={{ user, loading, logout, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// Permission helpers — centralise role checks so components never compare strings directly.
export function canWrite(role: OrgRole | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR';
}
export function canManageUsers(role: OrgRole | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}
export function isOwner(role: OrgRole | undefined): boolean {
  return role === 'OWNER';
}
export function canPush(role: OrgRole | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR';
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  OWNER:  'Owner',
  ADMIN:  'Admin',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  OWNER:  'Owner — full access, manages settings and team',
  ADMIN:  'Admin — manages projects and users',
  EDITOR: 'Editor — can generate and push to Xray',
  VIEWER: 'Viewer — read-only observer',
};
