import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {
  addPayment,
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
  // Generated lazily on the first sync attempt that gets far enough to
  // call addPayment, then persisted here so every later retry (including
  // after an ambiguous NetworkError) reuses the same id instead of a
  // fresh one — the same generate-once/reuse-on-retry rule the online
  // split-tender flow uses, just persisted here instead of in a ref
  // since sync can run across separate app-foreground events.
  paymentClientPaymentId?: string;
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
//
// `status`/`remainingCents` here describe PAYMENT state, not sync state:
// offline checkout still collects one tender that covers the full total
// (split tender is online-only), so from the cashier's perspective this
// order is fully paid — it just hasn't reached the server yet. The
// separate "Pending sync" banner (driven by `pending: true` from
// resolveTicket) communicates the sync state instead.
export function queuedTicketToTicket(record: QueuedTicketRecord): Ticket {
  return {
    id: 0,
    status: 'paid',
    items: record.items,
    subtotalCents: record.subtotalCents,
    taxCents: record.taxCents,
    totalCents: record.totalCents,
    tenderedCents: record.tenderedCents,
    changeCents: record.changeCents,
    createdAt: record.queuedAt,
    remainingCents: 0,
    payments: [
      {
        id: 0,
        tenderedCents: record.tenderedCents,
        appliedCents: record.totalCents,
        changeCents: record.changeCents,
        createdAt: record.queuedAt,
      },
    ],
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

// Attempts to sync every pending/failed queued ticket to the server: for
// each, create the ticket (idempotent via clientTicketId), then record
// the single tendered amount collected offline as one payment (idempotent
// via paymentClientPaymentId) so the synced ticket ends up status: 'paid'
// instead of sitting server-side as pending_payment forever. This is
// strictly one payment per queued ticket — offline checkout only ever
// collects one tender, so there is no ordering/multi-payment logic here;
// that's the online split-tender flow's job, untouched by this function.
//
// Safe to call concurrently or repeatedly — it relies entirely on the
// backend's clientTicketId/clientPaymentId dedup rather than any
// client-side locking, per the task's explicit "don't try to prevent
// double-sync purely client-side" instruction.
export async function syncQueuedTickets(): Promise<void> {
  const queue = await readQueue();
  const toSync = queue.filter(
    (t) => t.status === 'pending' || t.status === 'failed'
  );

  for (const record of toSync) {
    try {
      // Idempotent: if a previous sync attempt already created this
      // ticket (e.g. addPayment failed right after), this returns the
      // existing ticket rather than creating a duplicate — so we never
      // need to check existence separately first.
      const ticket = await createTicket(record.payload);

      if (ticket.remainingCents > 0) {
        let clientPaymentId = record.paymentClientPaymentId;
        if (!clientPaymentId) {
          clientPaymentId = Crypto.randomUUID();
          await setPaymentClientId(record.clientTicketId, clientPaymentId);
        }
        await addPayment(ticket.id, record.tenderedCents, clientPaymentId);
      }
      // else: a prior sync attempt's addPayment already succeeded (we
      // just didn't get to remove this from the queue afterward) —
      // nothing left to record, fall through to cleanup below.

      await removeFromQueue(record.clientTicketId);
    } catch (err) {
      // Whether createTicket or addPayment failed, leave the record
      // queued/pending exactly as it is today — never marked synced,
      // never removed — so the next sync trigger retries it. Because
      // both calls are idempotent (clientTicketId, then the persisted
      // paymentClientPaymentId), retrying from the top is always safe:
      // it can never end up half-synced (ticket created server-side but
      // the queue believing nothing happened) or double-applied.
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

async function setPaymentClientId(
  clientTicketId: string,
  paymentClientPaymentId: string
): Promise<void> {
  const queue = await readQueue();
  const index = queue.findIndex((t) => t.clientTicketId === clientTicketId);
  if (index === -1) return;
  queue[index] = { ...queue[index], paymentClientPaymentId };
  await writeQueue(queue);
}
