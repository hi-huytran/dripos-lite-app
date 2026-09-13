import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import {
  getSimulateOfflineFlag,
  setIsConnectedFlag,
  setSimulateOfflineFlag,
} from '../lib/offlineStatus';
import { getPendingSyncCount, syncQueuedTickets } from '../lib/ticketQueue';

const SIMULATE_OFFLINE_KEY = '@dripos/simulateOffline';

interface OfflineContextValue {
  simulateOffline: boolean;
  setSimulateOffline: (value: boolean) => void;
  isConnected: boolean;
  isOffline: boolean;
  pendingSyncCount: number;
  refreshPendingSyncCount: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | undefined>(
  undefined
);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [simulateOffline, setSimulateOfflineState] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const isConnectedRef = useRef(true);

  const refreshPendingSyncCount = useCallback(async () => {
    const count = await getPendingSyncCount();
    setPendingSyncCount(count);
  }, []);

  const runSync = useCallback(async () => {
    // Simulated offline must behave like real offline even though the
    // real network is fine — never let a foreground/reconnect trigger
    // sneak a sync past an active "Simulate offline mode".
    if (getSimulateOfflineFlag()) return;
    await syncQueuedTickets();
    await refreshPendingSyncCount();
  }, [refreshPendingSyncCount]);

  useEffect(() => {
    refreshPendingSyncCount();
  }, [refreshPendingSyncCount]);

  useEffect(() => {
    AsyncStorage.getItem(SIMULATE_OFFLINE_KEY).then((value) => {
      const parsed = value === 'true';
      setSimulateOfflineFlag(parsed);
      setSimulateOfflineState(parsed);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected !== false;
      const wasDisconnected = !isConnectedRef.current;
      isConnectedRef.current = connected;
      setIsConnectedFlag(connected);
      setIsConnected(connected);
      if (wasDisconnected && connected) {
        runSync();
      }
    });
    return unsubscribe;
  }, [runSync]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        runSync();
      }
    });
    return () => subscription.remove();
  }, [runSync]);

  const setSimulateOffline = useCallback(
    (value: boolean) => {
      const wasSimulatingOffline = simulateOffline;
      setSimulateOfflineFlag(value);
      setSimulateOfflineState(value);
      AsyncStorage.setItem(SIMULATE_OFFLINE_KEY, value ? 'true' : 'false');
      if (wasSimulatingOffline && !value) {
        runSync();
      }
    },
    [simulateOffline, runSync]
  );

  return (
    <OfflineContext.Provider
      value={{
        simulateOffline,
        setSimulateOffline,
        isConnected,
        isOffline: simulateOffline || !isConnected,
        pendingSyncCount,
        refreshPendingSyncCount,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline(): OfflineContextValue {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
}
