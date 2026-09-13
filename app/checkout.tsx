import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCart } from '../context/CartContext';
import { createTicket } from '../lib/api';
import { formatCents } from '../lib/format';
import { calculateUnitPriceCents } from '../lib/pricing';
import { useProductsById } from '../hooks/useProductsById';

const TAX_RATE = 0.08875;

interface PaymentMethod {
  id: string;
  label: string;
  enabled: boolean;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'cash', label: 'Cash', enabled: true },
  { id: 'card', label: 'Card', enabled: false },
  { id: 'gift-card', label: 'Gift Card', enabled: false },
];

function parseTenderedCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

export default function CheckoutScreen() {
  const router = useRouter();
  const { items, dispatch } = useCart();

  const [selectedMethod, setSelectedMethod] = useState<string>('cash');
  const [tenderedInput, setTenderedInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    productsById,
    loading: productsLoading,
    error: productsError,
    reload: loadProducts,
  } = useProductsById(items.length > 0);

  const subtotalCents = useMemo(() => {
    if (!productsById) return 0;
    return items.reduce((sum, item) => {
      const product = productsById[item.productId];
      if (!product) return sum;
      const unitPriceCents = calculateUnitPriceCents(
        product,
        item.selectedOptionIds
      );
      return sum + unitPriceCents * item.quantity;
    }, 0);
  }, [items, productsById]);

  const estimatedTaxCents = Math.round(subtotalCents * TAX_RATE);
  const estimatedTotalCents = subtotalCents + estimatedTaxCents;

  const tenderedCents = parseTenderedCents(tenderedInput);
  const tenderedInvalid = tenderedInput.trim() !== '' && tenderedCents === null;
  const canSubmit =
    selectedMethod === 'cash' && tenderedCents !== null && !submitting;

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Checkout' }} />
        <Text>Your cart is empty</Text>
        <Pressable
          style={styles.linkButton}
          onPress={() => router.push('/')}
          accessibilityRole="button"
          accessibilityLabel="Browse products"
        >
          <Text style={styles.linkButtonText}>Browse Products</Text>
        </Pressable>
      </View>
    );
  }

  async function handleCompleteOrder() {
    if (tenderedCents === null) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const ticket = await createTicket({
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          selectedOptionIds: item.selectedOptionIds,
        })),
        tenderedCents,
      });

      dispatch({ type: 'CLEAR_CART' });
      // Drop Cart/Checkout from the stack before pushing Receipt, so
      // back-navigation from Receipt lands on the product list, not a
      // now-empty Cart or a stale Checkout.
      router.dismissTo('/');
      router.push(`/receipt/${ticket.id}`);
    } catch (err) {
      setSubmitError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (productsLoading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Checkout' }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (productsError) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Checkout' }} />
        <Text style={styles.errorText}>{productsError}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={loadProducts}
          accessibilityRole="button"
          accessibilityLabel="Retry loading checkout"
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Checkout' }} />

      <Text style={styles.sectionTitle}>Payment Method</Text>
      {PAYMENT_METHODS.map((method) => {
        const isSelected = selectedMethod === method.id;
        return (
          <Pressable
            key={method.id}
            style={[
              styles.methodRow,
              !method.enabled && styles.methodRowDisabled,
            ]}
            disabled={!method.enabled}
            onPress={() => setSelectedMethod(method.id)}
            accessibilityRole="radio"
            accessibilityState={{
              checked: isSelected,
              disabled: !method.enabled,
            }}
            accessibilityLabel={`${method.label}${
              !method.enabled ? ', unavailable' : ''
            }`}
          >
            <View style={styles.radioOuter}>
              {isSelected && <View style={styles.radioInner} />}
            </View>
            <Text
              style={[
                styles.methodLabel,
                !method.enabled && styles.methodLabelDisabled,
              ]}
            >
              {method.label}
              {!method.enabled ? ' (unavailable)' : ''}
            </Text>
          </Pressable>
        );
      })}

      <View style={styles.totalsSection}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Subtotal</Text>
          <Text style={styles.totalsValue}>{formatCents(subtotalCents)}</Text>
        </View>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Estimated Tax</Text>
          <Text style={styles.totalsValue}>
            {formatCents(estimatedTaxCents)}
          </Text>
        </View>
        <View style={styles.totalsRow}>
          <Text style={styles.estimatedTotalLabel}>Estimated Total</Text>
          <Text style={styles.estimatedTotalValue}>
            {formatCents(estimatedTotalCents)}
          </Text>
        </View>
        <Text style={styles.totalsNote}>
          Final total is calculated by the server when the order is placed.
        </Text>
      </View>

      {selectedMethod === 'cash' && (
        <View style={styles.tenderedSection}>
          <Text style={styles.sectionTitle}>Amount Tendered</Text>
          <View style={styles.tenderedInputRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.tenderedInput}
              value={tenderedInput}
              onChangeText={setTenderedInput}
              placeholder="0.00"
              keyboardType="decimal-pad"
              editable={!submitting}
              accessibilityLabel="Amount tendered in dollars"
            />
          </View>
          {tenderedInvalid && (
            <Text style={styles.errorText}>
              Enter a valid amount greater than $0.00
            </Text>
          )}
        </View>
      )}

      {submitError && (
        <View style={styles.submitErrorBox}>
          <Text style={styles.errorText}>{submitError}</Text>
        </View>
      )}

      <Pressable
        style={[styles.completeButton, !canSubmit && styles.completeButtonDisabled]}
        disabled={!canSubmit}
        onPress={handleCompleteOrder}
        accessibilityRole="button"
        accessibilityLabel={submitting ? 'Placing order' : 'Complete order'}
        accessibilityState={{ disabled: !canSubmit, busy: submitting }}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.completeButtonText}>Complete Order</Text>
        )}
      </Pressable>
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
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  methodRowDisabled: {
    opacity: 0.4,
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
  methodLabel: {
    fontSize: 15,
  },
  methodLabelDisabled: {
    color: '#888',
  },
  totalsSection: {
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  totalsLabel: {
    fontSize: 15,
    color: '#555',
  },
  totalsValue: {
    fontSize: 15,
  },
  estimatedTotalLabel: {
    fontSize: 17,
    fontWeight: 'bold',
  },
  estimatedTotalValue: {
    fontSize: 17,
    fontWeight: 'bold',
  },
  totalsNote: {
    marginTop: 6,
    fontSize: 12,
    color: '#777',
  },
  tenderedSection: {
    marginTop: 24,
  },
  tenderedInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  dollarSign: {
    fontSize: 18,
    marginRight: 4,
    color: '#555',
  },
  tenderedInput: {
    flex: 1,
    fontSize: 18,
    paddingVertical: 10,
  },
  errorText: {
    color: '#e33',
    marginTop: 8,
  },
  submitErrorBox: {
    marginTop: 20,
  },
  completeButton: {
    marginTop: 32,
    backgroundColor: '#222',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  completeButtonDisabled: {
    backgroundColor: '#aaa',
  },
  completeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  linkButton: {
    backgroundColor: '#222',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  linkButtonText: {
    color: '#fff',
    fontWeight: 'bold',
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
