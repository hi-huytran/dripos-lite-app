import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CartProvider, useCart } from '../context/CartContext';
import { OfflineProvider, useOffline } from '../context/OfflineContext';

function CartHeaderButton() {
  const router = useRouter();
  const { items } = useCart();
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Pressable
      onPress={() => router.navigate('/cart')}
      style={styles.button}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={
        itemCount > 0 ? `Cart, ${itemCount} items` : 'Cart, empty'
      }
    >
      <Text style={styles.icon}>🛒</Text>
      {itemCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{itemCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

function TicketsHeaderButton() {
  const router = useRouter();
  const { pendingSyncCount } = useOffline();

  return (
    <Pressable
      onPress={() => router.navigate('/tickets')}
      style={styles.button}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={
        pendingSyncCount > 0
          ? `View past tickets, ${pendingSyncCount} pending sync`
          : 'View past tickets'
      }
    >
      <Text style={styles.icon}>🧾</Text>
      {pendingSyncCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{pendingSyncCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

function SettingsHeaderButton() {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.navigate('/settings')}
      style={styles.button}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel="Settings"
    >
      <Text style={styles.icon}>⚙️</Text>
    </Pressable>
  );
}

function HeaderRight() {
  return (
    <View style={styles.headerRight}>
      <SettingsHeaderButton />
      <TicketsHeaderButton />
      <CartHeaderButton />
    </View>
  );
}

function RootStack() {
  return (
    <Stack
      screenOptions={{
        headerRight: () => <HeaderRight />,
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <OfflineProvider>
      <CartProvider>
        <RootStack />
      </CartProvider>
    </OfflineProvider>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginRight: 8,
  },
  button: {},
  icon: {
    fontSize: 22,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: '#e33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
