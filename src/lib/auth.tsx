import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { db, supabase, errorText } from './supabase';
import type { Profile } from './domain';

interface AuthContextType {
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  profile: null,
  session: null,
  loading: true,
  error: '',
  reload: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const seq = ++generation.current;
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      const { data, error: sessionError } = await db().auth.getSession();
      if (sessionError) throw sessionError;
      if (seq !== generation.current) return;

      setSession(data.session);
      if (!data.session) {
        setProfile(null);
        setError('');
        return;
      }

      const { data: userProfile, error: profileError } = await db()
        .from('profiles')
        .select('*')
        .eq('id', data.session.user.id)
        .single();

      if (seq !== generation.current) return;

      if (profileError || !userProfile?.active) {
        setProfile(null);
        setError(
          'Akun tidak aktif atau profile belum tersedia. Hubungi administrator.'
        );
        return;
      }

      setProfile(userProfile);
      setError('');
    } catch (e) {
      if (seq === generation.current) {
        setProfile(null);
        setError(errorText(e));
      }
    } finally {
      if (seq === generation.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();

    const sub = supabase?.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        window.history.replaceState({}, '', '/recovery');
      }
      setTimeout(() => void reload(), 0);
    });

    const timer = setInterval(() => void reload(), 30000);
    const focus = () => void reload();
    window.addEventListener('focus', focus);

    return () => {
      generation.current++;
      sub?.data.subscription.unsubscribe();
      clearInterval(timer);
      window.removeEventListener('focus', focus);
    };
  }, [reload]);

  return (
    <AuthContext.Provider
      value={{ profile, session, loading, error, reload }}
    >
      {children}
    </AuthContext.Provider>
  );
}
