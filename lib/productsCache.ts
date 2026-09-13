import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product } from './api';

const PRODUCTS_CACHE_KEY = '@dripos/productsCache';

export async function cacheProducts(products: Product[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(products));
  } catch {
    // Caching is best-effort — a write failure shouldn't block the caller
    // from using the products it already has.
  }
}

export async function loadCachedProducts(): Promise<Product[] | null> {
  try {
    const raw = await AsyncStorage.getItem(PRODUCTS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Product[];
  } catch {
    return null;
  }
}
