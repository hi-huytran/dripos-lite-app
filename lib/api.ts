const API_BASE_URL = 'https://dripos-lite-backend-production.up.railway.app';

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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

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

export function getProducts(): Promise<Product[]> {
  return request<Product[]>('/products');
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
