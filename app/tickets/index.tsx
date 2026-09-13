import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getTickets, TicketListItem } from '../../lib/api';
import { formatCents } from '../../lib/format';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function TicketsListScreen() {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTickets = useCallback(() => {
    setLoading(true);
    setError(null);
    getTickets()
      .then(setTickets)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Tickets are created elsewhere (Checkout), so refetch every time this
  // screen gains focus rather than only on first mount.
  useFocusEffect(
    useCallback(() => {
      loadTickets();
    }, [loadTickets])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Tickets' }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Tickets' }} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={loadTickets}
          accessibilityRole="button"
          accessibilityLabel="Retry loading tickets"
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (tickets.length === 0) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Tickets' }} />
        <Text>No tickets yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Tickets' }} />
      <FlatList
        data={tickets}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/tickets/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Ticket ${item.id}, ${item.status}, ${formatCents(
              item.totalCents
            )}, ${formatDate(item.createdAt)}`}
          >
            <View>
              <Text style={styles.ticketId}>Ticket #{item.id}</Text>
              <Text style={styles.meta}>
                {item.status} • {formatDate(item.createdAt)}
              </Text>
            </View>
            <Text style={styles.total}>{formatCents(item.totalCents)}</Text>
          </Pressable>
        )}
      />
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
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  ticketId: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  meta: {
    marginTop: 2,
    fontSize: 13,
    color: '#666',
    textTransform: 'capitalize',
  },
  total: {
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
