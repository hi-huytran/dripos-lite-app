// Plain module-level mirror of the offline state, so non-React modules
// (lib/api.ts, the ticket sync queue) can read it synchronously without
// needing a hook. The source of truth for these flags is
// context/OfflineContext.tsx, which keeps this module in sync via the
// setters below whenever AsyncStorage or NetInfo report a change.
let simulateOfflineFlag = false;
let isConnectedFlag = true;

export function setSimulateOfflineFlag(value: boolean): void {
  simulateOfflineFlag = value;
}

export function setIsConnectedFlag(value: boolean): void {
  isConnectedFlag = value;
}

export function getSimulateOfflineFlag(): boolean {
  return simulateOfflineFlag;
}

export function isOffline(): boolean {
  return simulateOfflineFlag || !isConnectedFlag;
}
