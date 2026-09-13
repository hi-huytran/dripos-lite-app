import { isOffline } from './offlineStatus';
import { cacheProducts, loadCachedProducts } from './productsCache';

const API_BASE_URL = 'https://dripos-lite-backend-production.up.railway.app';

// Thrown when `fetch` itself fails (no response reached the app at all) —
// as opposed to a reachable server responding with a 4xx/5xx error. This
// distinction lets callers fall back to cached/queued data only for real
// connectivity failures, not for genuine validation/business errors.
export class NetworkError extends Error {}

export interface ModifierOption {
  id: string;
  name: string;
  priceDeltaCents: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  required: boolean;
  options: ModifierOption[];
}

export interface Product {
  id: string;
  name: string;
  soldOut: boolean;
  category: string;
  priceCents: number;
  description: string | null;
  modifierGroups: ModifierGroup[];
}

export interface CreateTicketItemInput {
  productId: string;
  quantity: number;
  selectedOptionIds: string[];
}

export interface CreateTicketPayload {
  items: CreateTicketItemInput[];
  tenderedCents: number;
  clientTicketId: string;
}

export interface TicketItemModifier {
  optionId: string;
  optionName: string;
  priceDeltaCents: number;
}

export interface TicketItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  modifiers: TicketItemModifier[];
}

export interface Ticket {
  id: number;
  status: string;
  items: TicketItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  tenderedCents: number;
  changeCents: number;
  createdAt: string;
}

export interface TicketListItem {
  id: number;
  status: string;
  totalCents: number;
  createdAt: string;
}

interface ApiErrorBody {
  error?: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new NetworkError('Network request failed');
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as ApiErrorBody;
      if (body?.error) {
        message = body.error;
      }
    } catch {
      // response body wasn't JSON; fall back to the generic message
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function getProducts(): Promise<Product[]> {
  if (isOffline()) {
    const cached = await loadCachedProducts();
    if (cached) return cached;
    throw new Error('No internet connection and no cached products available');
  }

  try {
    const products = await request<Product[]>('/products');
    await cacheProducts(products);
    return products;
  } catch (err) {
    if (err instanceof NetworkError) {
      const cached = await loadCachedProducts();
      if (cached) return cached;
    }
    throw err;
  }
}

export function getProduct(id: string): Promise<Product> {
  return request<Product>(`/products/${id}`);
}

export function createTicket(payload: CreateTicketPayload): Promise<Ticket> {
  return request<Ticket>('/tickets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getTickets(): Promise<TicketListItem[]> {
  return request<TicketListItem[]>('/tickets');
}

export function getTicket(id: number | string): Promise<Ticket> {
  return request<Ticket>(`/tickets/${id}`);
}
