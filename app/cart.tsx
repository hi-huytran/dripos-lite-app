import { Stack, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCart } from '../context/CartContext';
import { formatCents } from '../lib/format';
import { calculateUnitPriceCents } from '../lib/pricing';
import { useProductsById } from '../hooks/useProductsById';

export default function CartScreen() {
  const router = useRouter();
  const { items, dispatch } = useCart();

  const {
    productsById,
    loading,
    error,
    reload: loadProducts,
  } = useProductsById(items.length > 0);

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Cart' }} />
        <Text>Your cart is empty</Text>
        <Pressable
          style={styles.browseButton}
          onPress={() => router.push('/')}
          accessibilityRole="button"
          accessibilityLabel="Browse products"
        >
          <Text style={styles.browseButtonText}>Browse Products</Text>
        </Pressable>
      </View>
    );
  }

  if (loading || !productsById) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Cart' }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Cart' }} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={loadProducts}
          accessibilityRole="button"
          accessibilityLabel="Retry loading cart"
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const lines = items.map((item, index) => {
    const product = productsById[item.productId];
    const optionsById = new Map(
      (product?.modifierGroups ?? []).flatMap((group) =>
        group.options.map((option) => [option.id, option] as const)
      )
    );
    const selectedOptions = item.selectedOptionIds
      .map((optionId) => optionsById.get(optionId))
      .filter((option): option is NonNullable<typeof option> => !!option);

    const unitPriceCents = product
      ? calculateUnitPriceCents(product, item.selectedOptionIds)
      : 0;
    const lineTotalCents = unitPriceCents * item.quantity;

    return {
      index,
      productName: product?.name ?? item.productId,
      selectedOptionNames: selectedOptions.map((o) => o.name),
      quantity: item.quantity,
      lineTotalCents,
    };
  });

  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Cart' }} />
      <ScrollView>
        {lines.map((line) => (
          <View key={line.index} style={styles.line}>
            <View style={styles.lineHeader}>
              <Text style={styles.productName}>{line.productName}</Text>
              <Text style={styles.lineTotal}>
                {formatCents(line.lineTotalCents)}
              </Text>
            </View>

            {line.selectedOptionNames.length > 0 && (
              <Text style={styles.modifiers}>
                {line.selectedOptionNames.join(', ')}
              </Text>
            )}

            <View style={styles.lineFooter}>
              <View style={styles.quantityControls}>
                <Pressable
                  style={[
                    styles.quantityButton,
                    line.quantity <= 1 && styles.quantityButtonDisabled,
                  ]}
                  disabled={line.quantity <= 1}
                  onPress={() =>
                    dispatch({
                      type: 'UPDATE_QUANTITY',
                      index: line.index,
                      quantity: line.quantity - 1,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Decrease quantity of ${line.productName}`}
                  accessibilityState={{ disabled: line.quantity <= 1 }}
                >
                  <Text style={styles.quantityButtonText}>-</Text>
                </Pressable>
                <Text style={styles.quantityValue}>{line.quantity}</Text>
                <Pressable
                  style={styles.quantityButton}
                  onPress={() =>
                    dispatch({
                      type: 'UPDATE_QUANTITY',
                      index: line.index,
                      quantity: line.quantity + 1,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Increase quantity of ${line.productName}`}
                >
                  <Text style={styles.quantityButtonText}>+</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() =>
                  dispatch({ type: 'REMOVE_ITEM', index: line.index })
                }
                accessibilityRole="button"
                accessibilityLabel={`Remove ${line.productName} from cart`}
              >
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.subtotalRow}>
          <Text style={styles.subtotalLabel}>Subtotal</Text>
          <Text style={styles.subtotalValue}>{formatCents(subtotalCents)}</Text>
        </View>
        <Text style={styles.subtotalNote}>
          Tax and total are calculated at checkout.
        </Text>
        <Pressable
          style={styles.checkoutButton}
          onPress={() => router.push('/checkout')}
          accessibilityRole="button"
          accessibilityLabel="Proceed to checkout"
        >
          <Text style={styles.checkoutButtonText}>Checkout</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
  },
  browseButton: {
    backgroundColor: '#222',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  browseButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  errorText: {
    color: '#e33',
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
  line: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  lineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  productName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  lineTotal: {
    fontSize: 16,
  },
  modifiers: {
    marginTop: 4,
    color: '#555',
  },
  lineFooter: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonDisabled: {
    opacity: 0.4,
  },
  quantityButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  quantityValue: {
    fontSize: 16,
    marginHorizontal: 14,
    minWidth: 16,
    textAlign: 'center',
  },
  removeText: {
    color: '#e33',
    fontWeight: 'bold',
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  subtotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  subtotalValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  subtotalNote: {
    marginTop: 4,
    fontSize: 12,
    color: '#777',
  },
  checkoutButton: {
    marginTop: 12,
    backgroundColor: '#222',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  checkoutButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
