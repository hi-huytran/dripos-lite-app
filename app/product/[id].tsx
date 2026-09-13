import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCart } from '../../context/CartContext';
import { getProduct, Product } from '../../lib/api';
import { formatCents, formatCentsDelta } from '../../lib/format';
import { calculateUnitPriceCents } from '../../lib/pricing';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { dispatch } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedByGroup, setSelectedByGroup] = useState<
    Record<string, string>
  >({});
  const [quantity, setQuantity] = useState(1);

  const loadProduct = useCallback(() => {
    setLoading(true);
    setError(null);
    getProduct(id)
      .then((p) => {
        setProduct(p);
        setSelectedByGroup({});
        setQuantity(1);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  const selectedOptionIds = useMemo(
    () => Object.values(selectedByGroup),
    [selectedByGroup]
  );

  const unitPriceCents = useMemo(() => {
    if (!product) return 0;
    return calculateUnitPriceCents(product, selectedOptionIds);
  }, [product, selectedOptionIds]);

  const lineTotalCents = unitPriceCents * quantity;

  const missingRequiredGroup = useMemo(() => {
    if (!product) return null;
    return (
      product.modifierGroups.find(
        (group) => group.required && !selectedByGroup[group.id]
      ) ?? null
    );
  }, [product, selectedByGroup]);

  function selectOption(groupId: string, optionId: string) {
    setSelectedByGroup((prev) => ({ ...prev, [groupId]: optionId }));
  }

  function handleAddToCart() {
    if (!product) return;
    dispatch({
      type: 'ADD_ITEM',
      item: {
        productId: product.id,
        quantity,
        selectedOptionIds,
      },
    });
    router.back();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={loadProduct}
          accessibilityRole="button"
          accessibilityLabel="Retry loading product"
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!product) {
    return null;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: product.name }} />
      <Text style={styles.name}>{product.name}</Text>
      <Text style={styles.basePrice}>{formatCents(product.priceCents)}</Text>
      {product.description && (
        <Text style={styles.description}>{product.description}</Text>
      )}

      {product.modifierGroups.map((group) => (
        <View key={group.id} style={styles.group}>
          <Text style={styles.groupTitle}>
            {group.name}
            {group.required ? ' (Required)' : ''}
          </Text>
          {group.options.map((option) => {
            const isSelected = selectedByGroup[group.id] === option.id;
            const delta = formatCentsDelta(option.priceDeltaCents);
            return (
              <Pressable
                key={option.id}
                style={styles.option}
                onPress={() => selectOption(group.id, option.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={`${option.name}${delta ? `, ${delta}` : ''}`}
              >
                <View style={styles.radioOuter}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.optionName}>{option.name}</Text>
                <Text style={styles.optionDelta}>{delta}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.quantityRow}>
        <Text style={styles.groupTitle}>Quantity</Text>
        <View style={styles.quantityControls}>
          <Pressable
            style={styles.quantityButton}
            onPress={() => setQuantity((q) => Math.max(1, q - 1))}
            accessibilityRole="button"
            accessibilityLabel="Decrease quantity"
          >
            <Text style={styles.quantityButtonText}>-</Text>
          </Pressable>
          <Text style={styles.quantityValue}>{quantity}</Text>
          <Pressable
            style={styles.quantityButton}
            onPress={() => setQuantity((q) => q + 1)}
            accessibilityRole="button"
            accessibilityLabel="Increase quantity"
          >
            <Text style={styles.quantityButtonText}>+</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.lineTotal}>
        Total: {formatCents(lineTotalCents)}
      </Text>

      {product.soldOut ? (
        <View style={styles.soldOutBox}>
          <Text style={styles.soldOutText}>Sold out</Text>
        </View>
      ) : (
        <View>
          <Pressable
            style={[
              styles.addButton,
              missingRequiredGroup && styles.addButtonDisabled,
            ]}
            disabled={!!missingRequiredGroup}
            onPress={handleAddToCart}
            accessibilityRole="button"
            accessibilityLabel="Add to cart"
            accessibilityState={{ disabled: !!missingRequiredGroup }}
          >
            <Text style={styles.addButtonText}>Add to Cart</Text>
          </Pressable>
          {missingRequiredGroup && (
            <Text style={styles.disabledReason}>
              Select {missingRequiredGroup.name}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  basePrice: {
    fontSize: 18,
    marginTop: 4,
  },
  description: {
    marginTop: 8,
    color: '#555',
  },
  group: {
    marginTop: 20,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#666',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#222',
  },
  optionName: {
    flex: 1,
    fontSize: 15,
  },
  optionDelta: {
    fontSize: 14,
    color: '#555',
  },
  quantityRow: {
    marginTop: 20,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  quantityValue: {
    fontSize: 16,
    marginHorizontal: 16,
    minWidth: 20,
    textAlign: 'center',
  },
  lineTotal: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: 'bold',
  },
  addButton: {
    marginTop: 16,
    backgroundColor: '#222',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#aaa',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  disabledReason: {
    marginTop: 6,
    color: '#e33',
    textAlign: 'center',
  },
  soldOutBox: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#eee',
    alignItems: 'center',
  },
  soldOutText: {
    color: '#666',
    fontWeight: 'bold',
    fontSize: 16,
  },
  errorText: {
    color: '#e33',
    marginBottom: 12,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#222',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
