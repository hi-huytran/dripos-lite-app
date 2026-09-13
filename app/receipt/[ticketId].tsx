import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TicketSummary } from '../../components/TicketSummary';
import { Ticket } from '../../lib/api';
import { resolveTicket } from '../../lib/ticketQueue';

export default function ReceiptScreen() {
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const router = useRouter();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTicket = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resolved = await resolveTicket(ticketId);
      setPending(resolved.pending);
      setTicket(resolved.ticket);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

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
          onPress={loadTicket}
          accessibilityRole="button"
          accessibilityLabel="Retry loading receipt"
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!ticket) {
    return null;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{ title: pending ? 'Pending Sync' : `Receipt #${ticket.id}` }}
      />

      {pending && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingBannerText}>
            Pending sync — this order hasn't reached the server yet. Totals
            below are estimated on this device.
          </Text>
        </View>
      )}

      <TicketSummary ticket={ticket} />

      <Pressable
        style={styles.newOrderButton}
        onPress={() => router.dismissAll()}
        accessibilityRole="button"
        accessibilityLabel="Start new order"
      >
        <Text style={styles.newOrderButtonText}>Start New Order</Text>
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
  },
  pendingBanner: {
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  pendingBannerText: {
    color: '#664d03',
    fontSize: 13,
  },
  newOrderButton: {
    marginTop: 28,
    backgroundColor: '#222',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  newOrderButtonText: {
    color: '#fff',
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
