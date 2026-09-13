import { StyleSheet, Text, View } from 'react-native';
import { Ticket } from '../lib/api';
import { formatCents } from '../lib/format';

// Shared itemized-items + totals block, used by both the post-checkout
// Receipt screen and the historical Ticket Detail screen — same server
// response shape (Ticket), same content, different surrounding chrome.
export function TicketSummary({ ticket }: { ticket: Ticket }) {
  return (
    <>
      {ticket.items.map((item, index) => (
        <View key={index} style={styles.item}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemName}>
              {item.quantity}x {item.productName}
            </Text>
            <Text style={styles.itemTotal}>
              {formatCents(item.lineTotalCents)}
            </Text>
          </View>
          {item.modifiers.length > 0 && (
            <Text style={styles.modifiers}>
              {item.modifiers.map((m) => m.optionName).join(', ')}
            </Text>
          )}
        </View>
      ))}

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>
            {formatCents(ticket.subtotalCents)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Tax</Text>
          <Text style={styles.summaryValue}>
            {formatCents(ticket.taxCents)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            {formatCents(ticket.totalCents)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Tendered</Text>
          <Text style={styles.summaryValue}>
            {formatCents(ticket.tenderedCents)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Change</Text>
          <Text style={styles.summaryValue}>
            {formatCents(ticket.changeCents)}
          </Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  item: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemName: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  itemTotal: {
    fontSize: 15,
  },
  modifiers: {
    marginTop: 2,
    color: '#555',
  },
  summary: {
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 15,
    color: '#555',
  },
  summaryValue: {
    fontSize: 15,
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: 'bold',
  },
  totalValue: {
    fontSize: 17,
    fontWeight: 'bold',
  },
});
