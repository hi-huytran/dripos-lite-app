import { Product } from './api';

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
