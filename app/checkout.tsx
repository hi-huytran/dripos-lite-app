import * as Crypto from 'expo-crypto';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useOffline } from '../context/OfflineContext';
import { addPayment, createTicket, NetworkError, Payment } from '../lib/api';
import { formatCents } from '../lib/format';
import { calculateUnitPriceCents, buildOfflineTicketItems } from '../lib/pricing';
import { enqueueTicket } from '../lib/ticketQueue';
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

// Module-level, not component state: persists across CheckoutScreen
// unmount/remount within this app session (but not across app restarts,
// matching the rest of the app's no-persisted-in-progress-state cut). We
// deliberately do NOT try to intercept or block native back navigation —
// native-stack doesn't reliably support that (beforeRemove is documented
// as unsupported there). Instead, if the user leaves mid-payment via any
// native back path (swipe, hardware button) and re-enters Checkout, this
// lets the screen resume the same in-progress ticket instead of calling
// POST /tickets again and creating a second, orphaned pending_payment
// ticket — which was the actual reported symptom.
let inProgressTicket: {
  ticketId: number;
  totalCents: number;
  remainingCents: number;
  payments: Payment[];
} | null = null;

export default function CheckoutScreen() {
  const router = useRouter();
  const { items, dispatch } = useCart();
  const { isOffline, refreshPendingSyncCount } = useOffline();

  const [selectedMethod, setSelectedMethod] = useState<string>('cash');

  // ---------------------------------------------------------------------
  // Offline path (single-payload queue) — deliberately unchanged from
  // before this task. Split tender requires a live back-and-forth with
  // the server (create ticket, then one or more payment round-trips), so
  // it only makes sense online. When offline (real NetworkError, or the
  // simulateOffline toggle), checkout falls back to the original
  // "one tender that must cover the total, queued as a single record"
  // flow. Building an offline-capable split-tender queue (multiple
  // pending payments per queued ticket, replayed in order once back
  // online) is a deliberate scope cut, not an oversight.
  // ---------------------------------------------------------------------
  const [offlineTenderedInput, setOfflineTenderedInput] = useState('');
  const [offlineSubmitting, setOfflineSubmitting] = useState(false);
  const [offlineSubmitError, setOfflineSubmitError] = useState<string | null>(
    null
  );

  const {
    productsById,
    loading: productsLoading,
    error: productsError,
    reload: loadProducts,
  } = useProductsById(isOffline && items.length > 0);

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

  const offlineTenderedCents = parseTenderedCents(offlineTenderedInput);
  const offlineTenderedInvalid =
    offlineTenderedInput.trim() !== '' && offlineTenderedCents === null;
  const canSubmitOffline =
    selectedMethod === 'cash' &&
    offlineTenderedCents !== null &&
    !offlineSubmitting;

  async function handleQueueOffline() {
    if (offlineTenderedCents === null || !productsById) return;

    setOfflineSubmitting(true);
    setOfflineSubmitError(null);

    const clientTicketId = Crypto.randomUUID();

    try {
      await enqueueTicket({
        clientTicketId,
        payload: {
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            selectedOptionIds: item.selectedOptionIds,
          })),
          clientTicketId,
        },
        items: buildOfflineTicketItems(items, productsById),
        subtotalCents,
        taxCents: estimatedTaxCents,
        totalCents: estimatedTotalCents,
        tenderedCents: offlineTenderedCents,
        changeCents: offlineTenderedCents - estimatedTotalCents,
        queuedAt: new Date().toISOString(),
        status: 'pending',
      });
      await refreshPendingSyncCount();

      dispatch({ type: 'CLEAR_CART' });
      router.dismissTo('/');
      router.push(`/receipt/${clientTicketId}`);
    } catch (err) {
      setOfflineSubmitError((err as Error).message);
      setOfflineSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------
  // Online path — split tender
  // ---------------------------------------------------------------------
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [ticketTotalCents, setTicketTotalCents] = useState<number | null>(
    null
  );
  const [remainingCents, setRemainingCents] = useState<number | null>(null);
  const [confirmedPayments, setConfirmedPayments] = useState<Payment[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [creatingTicket, setCreatingTicket] = useState(false);
  const [ticketCreationError, setTicketCreationError] = useState<
    string | null
  >(null);

  // Tracks the clientPaymentId for the tender amount currently in flight
  // or last-failed, keyed by that amount — so retrying the SAME amount
  // reuses the SAME id (safe replay via the server's idempotency check),
  // while changing the amount before retrying generates a fresh one.
  const pendingAttemptRef = useRef<{
    amountCents: number;
    clientPaymentId: string;
  } | null>(null);

  const createOnlineTicket = useCallback(async () => {
    setCreatingTicket(true);
    setTicketCreationError(null);
    try {
      const ticket = await createTicket({
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          selectedOptionIds: item.selectedOptionIds,
        })),
        clientTicketId: Crypto.randomUUID(),
      });
      setTicketId(ticket.id);
      setTicketTotalCents(ticket.totalCents);
      setRemainingCents(ticket.remainingCents);
      setConfirmedPayments(ticket.payments);
      inProgressTicket = {
        ticketId: ticket.id,
        totalCents: ticket.totalCents,
        remainingCents: ticket.remainingCents,
        payments: ticket.payments,
      };
    } catch (err) {
      setTicketCreationError((err as Error).message);
    } finally {
      setCreatingTicket(false);
    }
  }, [items]);

  // Resume an in-progress ticket from a prior mount of this screen
  // (see `inProgressTicket` above) instead of creating a new one.
  useEffect(() => {
    if (isOffline || items.length === 0 || ticketId !== null) return;

    if (inProgressTicket) {
      setTicketId(inProgressTicket.ticketId);
      setTicketTotalCents(inProgressTicket.totalCents);
      setRemainingCents(inProgressTicket.remainingCents);
      setConfirmedPayments(inProgressTicket.payments);
      return;
    }

    if (!creatingTicket && !ticketCreationError) {
      createOnlineTicket();
    }
  }, [
    isOffline,
    items.length,
    ticketId,
    creatingTicket,
    ticketCreationError,
    createOnlineTicket,
  ]);

  function handleCancelOrder() {
    // Only reachable before any payment has been confirmed (see the
    // header button below) — deliberately abandoning this attempt, so
    // the next entry into Checkout should start a fresh ticket rather
    // than resume this one.
    inProgressTicket = null;
    router.back();
  }

  const currentTenderedCents = parseTenderedCents(currentInput);
  const currentInputInvalid =
    currentInput.trim() !== '' && currentTenderedCents === null;
  const canConfirmTender =
    selectedMethod === 'cash' &&
    currentTenderedCents !== null &&
    !isSubmittingPayment;

  async function handleConfirmTender() {
    if (ticketId === null || currentTenderedCents === null) return;

    const previousAttempt = pendingAttemptRef.current;
    const clientPaymentId =
      previousAttempt && previousAttempt.amountCents === currentTenderedCents
        ? previousAttempt.clientPaymentId
        : Crypto.randomUUID();
    pendingAttemptRef.current = {
      amountCents: currentTenderedCents,
      clientPaymentId,
    };

    setIsSubmittingPayment(true);
    setPaymentError(null);

    try {
      const result = await addPayment(
        ticketId,
        currentTenderedCents,
        clientPaymentId
      );

      pendingAttemptRef.current = null;
      const updatedPayments = [...confirmedPayments, result.payment];
      setConfirmedPayments(updatedPayments);
      setRemainingCents(result.ticket.remainingCents);
      setCurrentInput('');
      setIsSubmittingPayment(false);

      if (result.ticket.remainingCents === 0) {
        inProgressTicket = null;
        dispatch({ type: 'CLEAR_CART' });
        router.dismissTo('/');
        router.push(`/receipt/${ticketId}`);
      } else if (inProgressTicket) {
        inProgressTicket = {
          ...inProgressTicket,
          remainingCents: result.ticket.remainingCents,
          payments: updatedPayments,
        };
      }
    } catch (err) {
      setIsSubmittingPayment(false);
      if (err instanceof NetworkError) {
        // We genuinely don't know whether this reached the server. Don't
        // regenerate a new clientPaymentId on the user's next tap — the
        // ref above already keeps the same one for this exact amount, so
        // retrying is safe (dedup) whether or not the first attempt
        // actually landed.
        setPaymentError(
          "Couldn't confirm that tender went through. Tap Confirm Tender again to safely retry — it won't double-apply."
        );
      } else {
        setPaymentError((err as Error).message);
      }
    }
  }

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

  const paymentMethodList = (
    <>
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
    </>
  );

  // ---- Offline render ----
  if (isOffline) {
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
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <Stack.Screen options={{ title: 'Checkout' }} />

        {paymentMethodList}

        <View style={styles.totalsSection}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>
              {formatCents(subtotalCents)}
            </Text>
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
            You're offline — this order will be queued and synced once back
            online.
          </Text>
        </View>

        {selectedMethod === 'cash' && (
          <View style={styles.tenderedSection}>
            <Text style={styles.sectionTitle}>Amount Tendered</Text>
            <View style={styles.tenderedInputRow}>
              <Text style={styles.dollarSign}>$</Text>
              <TextInput
                style={styles.tenderedInput}
                value={offlineTenderedInput}
                onChangeText={setOfflineTenderedInput}
                placeholder="0.00"
                keyboardType="decimal-pad"
                editable={!offlineSubmitting}
                accessibilityLabel="Amount tendered in dollars"
              />
            </View>
            {offlineTenderedInvalid && (
              <Text style={styles.errorText}>
                Enter a valid amount greater than $0.00
              </Text>
            )}
          </View>
        )}

        {offlineSubmitError && (
          <View style={styles.submitErrorBox}>
            <Text style={styles.errorText}>{offlineSubmitError}</Text>
          </View>
        )}

        <Pressable
          style={[
            styles.completeButton,
            !canSubmitOffline && styles.completeButtonDisabled,
          ]}
          disabled={!canSubmitOffline}
          onPress={handleQueueOffline}
          accessibilityRole="button"
          accessibilityLabel={
            offlineSubmitting ? 'Placing order' : 'Complete order'
          }
          accessibilityState={{
            disabled: !canSubmitOffline,
            busy: offlineSubmitting,
          }}
        >
          {offlineSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.completeButtonText}>Complete Order</Text>
          )}
        </Pressable>
      </ScrollView>
    );
  }

  // ---- Online render (split tender) ----
  if (creatingTicket) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Checkout' }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (ticketCreationError) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Checkout' }} />
        <Text style={styles.errorText}>{ticketCreationError}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={createOnlineTicket}
          accessibilityRole="button"
          accessibilityLabel="Retry creating ticket"
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (ticketId === null || remainingCents === null) {
    return null;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: 'Checkout',
          // Native-stack doesn't reliably support intercepting removal
          // (beforeRemove), so instead of trying to block back navigation
          // we just hide the button that invites it. Cancel Order (below)
          // is the one deliberate way out, and only before any payment is
          // confirmed; the in-progress-ticket resume logic above is the
          // safety net if the user still leaves via swipe/hardware back.
          headerBackVisible: false,
          headerLeft:
            confirmedPayments.length === 0
              ? () => (
                  <Pressable
                    onPress={handleCancelOrder}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel order"
                  >
                    <Text style={styles.cancelOrderText}>Cancel Order</Text>
                  </Pressable>
                )
              : () => null,
        }}
      />

      {paymentMethodList}

      <View style={styles.totalsSection}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Total</Text>
          <Text style={styles.totalsValue}>
            {formatCents(ticketTotalCents ?? 0)}
          </Text>
        </View>
        <View style={styles.totalsRow}>
          <Text style={styles.estimatedTotalLabel}>Remaining</Text>
          <Text style={styles.estimatedTotalValue}>
            {formatCents(remainingCents)}
          </Text>
        </View>
      </View>

      {confirmedPayments.length > 0 && (
        <View style={styles.confirmedSection}>
          <Text style={styles.sectionTitle}>Tenders</Text>
          {confirmedPayments.map((payment, index) => (
            <View key={payment.id} style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                Tender {index + 1}: {formatCents(payment.tenderedCents)}
              </Text>
              <Text style={styles.totalsValue}>
                change {formatCents(payment.changeCents)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {selectedMethod === 'cash' && (
        <View style={styles.tenderedSection}>
          <Text style={styles.sectionTitle}>
            {confirmedPayments.length > 0 ? 'Next Tender' : 'Amount Tendered'}
          </Text>
          <View style={styles.tenderedInputRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.tenderedInput}
              value={currentInput}
              onChangeText={setCurrentInput}
              placeholder="0.00"
              keyboardType="decimal-pad"
              editable={!isSubmittingPayment}
              accessibilityLabel="Amount tendered in dollars"
            />
          </View>
          {currentInputInvalid && (
            <Text style={styles.errorText}>
              Enter a valid amount greater than $0.00
            </Text>
          )}
          <Pressable
            style={styles.inputBackButton}
            disabled={currentInput.trim() === '' || isSubmittingPayment}
            onPress={() => setCurrentInput('')}
            accessibilityRole="button"
            accessibilityLabel="Discard this entry"
          >
            <Text
              style={[
                styles.inputBackButtonText,
                (currentInput.trim() === '' || isSubmittingPayment) &&
                  styles.inputBackButtonTextDisabled,
              ]}
            >
              Back
            </Text>
          </Pressable>
        </View>
      )}

      {paymentError && (
        <View style={styles.submitErrorBox}>
          <Text style={styles.errorText}>{paymentError}</Text>
        </View>
      )}

      <Pressable
        style={[
          styles.completeButton,
          !canConfirmTender && styles.completeButtonDisabled,
        ]}
        disabled={!canConfirmTender}
        onPress={handleConfirmTender}
        accessibilityRole="button"
        accessibilityLabel={
          isSubmittingPayment ? 'Confirming tender' : 'Confirm tender'
        }
        accessibilityState={{
          disabled: !canConfirmTender,
          busy: isSubmittingPayment,
        }}
      >
        {isSubmittingPayment ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.completeButtonText}>Confirm Tender</Text>
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
  confirmedSection: {
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
  cancelOrderText: {
    color: '#e33',
    fontWeight: 'bold',
    fontSize: 15,
  },
  inputBackButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  inputBackButtonText: {
    color: '#222',
    fontWeight: 'bold',
    fontSize: 15,
  },
  inputBackButtonTextDisabled: {
    color: '#aaa',
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
