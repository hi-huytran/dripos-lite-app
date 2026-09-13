import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CreateTicketPayload,
  createTicket,
  getTicket,
  NetworkError,
  Ticket,
  TicketItem,
} from './api';

const QUEUE_KEY = '@dripos/ticketQueue';

export type QueuedTicketStatus = 'pending' | 'failed' | 'synced';

export interface QueuedTicketRecord {
  clientTicketId: string;
  payload: CreateTicketPayload;
  items: TicketItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  tenderedCents: number;
  changeCents: number;
  queuedAt: string;
  status: QueuedTicketStatus;
}

async function readQueue(): Promise<QueuedTicketRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedTicketRecord[];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedTicketRecord[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getQueuedTickets(): Promise<QueuedTicketRecord[]> {
  return readQueue();
}

export async function getQueuedTicketByClientId(
  clientTicketId: string
): Promise<QueuedTicketRecord | null> {
  const queue = await readQueue();
  return queue.find((t) => t.clientTicketId === clientTicketId) ?? null;
}

export async function enqueueTicket(
  record: QueuedTicketRecord
): Promise<void> {
  const queue = await readQueue();
  queue.push(record);
  await writeQueue(queue);
}

export async function getPendingSyncCount(): Promise<number> {
  const queue = await readQueue();
  return queue.filter((t) => t.status === 'pending' || t.status === 'failed')
    .length;
}

// Converts a queued (not-yet-synced) record into the same `Ticket` shape
// the server returns, so it can render through the shared TicketSummary
// component. `id` is a placeholder — TicketSummary never displays it, and
// the Receipt/Tickets screens special-case pending tickets for their own
// title/labeling instead of trusting this id.
export function queuedTicketToTicket(record: QueuedTicketRecord): Ticket {
  return {
    id: 0,
    status: record.status,
    items: record.items,
    subtotalCents: record.subtotalCents,
    taxCents: record.taxCents,
    totalCents: record.totalCents,
    tenderedCents: record.tenderedCents,
    changeCents: record.changeCents,
    createdAt: record.queuedAt,
  };
}

export interface ResolvedTicket {
  ticket: Ticket;
  pending: boolean;
}

// Resolves a route param that may be either a still-queued clientTicketId
// (UUID) or a real server ticket id, checking the local queue first. Used
// by both the Receipt screen (right after checkout) and the Ticket Detail
// screen (browsing from the Tickets list) so pending orders render
// consistently before they've synced.
export async function resolveTicket(ticketId: string): Promise<ResolvedTicket> {
  const queued = await getQueuedTicketByClientId(ticketId);
  if (queued) {
    return { ticket: queuedTicketToTicket(queued), pending: true };
  }

  const fetched = await getTicket(ticketId);
  return { ticket: fetched, pending: false };
}

// Attempts to sync every pending/failed queued ticket to the server.
// Safe to call concurrently or repeatedly — it relies entirely on the
// backend's clientTicketId dedup (see POST /tickets) rather than any
// client-side locking, per the task's explicit "don't try to prevent
// double-sync purely client-side" instruction.
export async function syncQueuedTickets(): Promise<void> {
  const queue = await readQueue();
  const toSync = queue.filter(
    (t) => t.status === 'pending' || t.status === 'failed'
  );

  for (const record of toSync) {
    try {
      await createTicket(record.payload);
      await removeFromQueue(record.clientTicketId);
    } catch (err) {
      // Network failures should simply be retried on the next sync pass.
      // Anything else (e.g. a genuine validation error from the server)
      // is marked 'failed' so it's visibly distinguished, but is still
      // retried next time since there's no fix-up UI in this pass.
      const status: QueuedTicketStatus =
        err instanceof NetworkError ? 'pending' : 'failed';
      await updateStatus(record.clientTicketId, status);
    }
  }
}

async function removeFromQueue(clientTicketId: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((t) => t.clientTicketId !== clientTicketId));
}

async function updateStatus(
  clientTicketId: string,
  status: QueuedTicketStatus
): Promise<void> {
  const queue = await readQueue();
  const index = queue.findIndex((t) => t.clientTicketId === clientTicketId);
  if (index === -1) return;
  queue[index] = { ...queue[index], status };
  await writeQueue(queue);
}
