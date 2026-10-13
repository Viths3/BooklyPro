import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SessionManager } from './session';
const AuthContext = createContext<SessionManager | null>(null);
export function AuthProvider({
  children,
  manager,
}: {
  children: ReactNode;
  manager?: SessionManager;
}) {
  const queryClient = useQueryClient();
  const [session] = useState(
    () =>
      manager ??
      new SessionManager(() => {
        void queryClient.cancelQueries();
        queryClient.clear();
      }),
  );
  return (
    <AuthContext.Provider value={session}>{children}</AuthContext.Provider>
  );
}
export function useAuth() {
  const session = useContext(AuthContext);
  if (!session) throw new Error('AuthProvider is required');
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return { ...state, session };
}
