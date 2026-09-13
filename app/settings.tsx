import { Stack } from 'expo-router';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useOffline } from '../context/OfflineContext';

export default function SettingsScreen() {
  const { simulateOffline, setSimulateOffline } = useOffline();

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Settings' }} />

      <View style={styles.row}>
        <Text style={styles.label}>Simulate offline mode</Text>
        <Switch
          value={simulateOffline}
          onValueChange={setSimulateOffline}
          accessibilityRole="switch"
          accessibilityLabel="Simulate offline mode"
          accessibilityState={{ checked: simulateOffline }}
        />
      </View>

      <Text style={styles.hint}>
        When on, the app behaves as if there is no network connection:
        products load from the last cached list, and completing a checkout
        queues the order to sync once you turn this back off.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  label: {
    fontSize: 16,
  },
  hint: {
    marginTop: 8,
    fontSize: 13,
    color: '#666',
  },
});
