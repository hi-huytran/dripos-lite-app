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
import { getTickets } from '../../lib/api';
import { formatCents } from '../../lib/format';
import { getQueuedTickets } from '../../lib/ticketQueue';

interface TicketRow {
  key: string;
  navTarget: string;
  statusLabel: string;
  totalCents: number;
  createdAt: string;
  pending: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function TicketsListScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    setLoading(true);

    let serverError: string | null = null;
    let serverRows: TicketRow[] = [];
    try {
      const server = await getTickets();
      serverRows = server.map((t) => ({
        key: `server-${t.id}`,
        navTarget: String(t.id),
        statusLabel: t.status,
        totalCents: t.totalCents,
        createdAt: t.createdAt,
        pending: false,
      }));
    } catch (err) {
      serverError = (err as Error).message;
    }

    const queued = await getQueuedTickets();
    const queuedRows: TicketRow[] = queued.map((t) => ({
      key: `queued-${t.clientTicketId}`,
      navTarget: t.clientTicketId,
      statusLabel: 'Pending sync',
      totalCents: t.totalCents,
      createdAt: t.queuedAt,
      pending: true,
    }));

    const merged = [...serverRows, ...queuedRows].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );

    setRows(merged);
    // Only surface the server error if we have nothing at all to show —
    // locally-queued tickets should still render even if GET /tickets fails.
    setError(merged.length === 0 ? serverError : null);
    setLoading(false);
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

  if (rows.length === 0) {
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
        data={rows}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, item.pending && styles.rowPending]}
            onPress={() => router.push(`/tickets/${item.navTarget}`)}
            accessibilityRole="button"
            accessibilityLabel={`${
              item.pending ? 'Pending order' : `Ticket ${item.navTarget}`
            }, ${item.statusLabel}, ${formatCents(
              item.totalCents
            )}, ${formatDate(item.createdAt)}`}
          >
            <View>
              <Text style={styles.ticketId}>
                {item.pending ? 'Pending Order' : `Ticket #${item.navTarget}`}
              </Text>
              <Text style={styles.meta}>
                {item.statusLabel} • {formatDate(item.createdAt)}
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
  rowPending: {
    backgroundColor: '#fff8e1',
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
