import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { getProducts, Product } from '../lib/api';

export interface UseProductsByIdResult {
  productsById: Record<string, Product> | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// Fetches the full product catalog and indexes it by id, refetching every
// time the screen gains focus. `enabled` gates the fetch (screens skip it
// when there's nothing in the cart to resolve product data for).
export function useProductsById(enabled: boolean): UseProductsByIdResult {
  const [productsById, setProductsById] = useState<Record<
    string,
    Product
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    getProducts()
      .then((products) => {
        const map: Record<string, Product> = {};
        for (const product of products) {
          map[product.id] = product;
        }
        setProductsById(map);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (enabled) {
        reload();
      }
    }, [enabled, reload])
  );

  return { productsById, loading, error, reload };
}
