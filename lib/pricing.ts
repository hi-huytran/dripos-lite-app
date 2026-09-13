import { Product, TicketItem } from './api';

export function calculateUnitPriceCents(
  product: Product,
  selectedOptionIds: string[]
): number {
  const optionsById = new Map(
    product.modifierGroups.flatMap((group) =>
      group.options.map((option) => [option.id, option] as const)
    )
  );

  const deltaSum = selectedOptionIds.reduce((sum, optionId) => {
    const option = optionsById.get(optionId);
    return sum + (option?.priceDeltaCents ?? 0);
  }, 0);

  return product.priceCents + deltaSum;
}

interface CartLikeItem {
  productId: string;
  quantity: number;
  selectedOptionIds: string[];
}

// Builds full itemized TicketItem[] (names, modifiers, line totals) purely
// client-side, from cart items and the cached/loaded product catalog. Used
// to show a "Pending sync" receipt immediately when a checkout is queued
// offline, before the server has ever seen the ticket.
export function buildOfflineTicketItems(
  items: CartLikeItem[],
  productsById: Record<string, Product>
): TicketItem[] {
  return items.map((item) => {
    const product = productsById[item.productId];
    const optionsById = new Map(
      (product?.modifierGroups ?? []).flatMap((group) =>
        group.options.map((option) => [option.id, option] as const)
      )
    );

    const modifiers = item.selectedOptionIds
      .map((optionId) => optionsById.get(optionId))
      .filter((option): option is NonNullable<typeof option> => !!option)
      .map((option) => ({
        optionId: option.id,
        optionName: option.name,
        priceDeltaCents: option.priceDeltaCents,
      }));

    const unitPriceCents = product
      ? calculateUnitPriceCents(product, item.selectedOptionIds)
      : 0;

    return {
      productId: item.productId,
      productName: product?.name ?? item.productId,
      quantity: item.quantity,
      unitPriceCents,
      lineTotalCents: unitPriceCents * item.quantity,
      modifiers,
    };
  });
}
