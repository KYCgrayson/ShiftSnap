// Dedicated simulator QA entry. Not referenced by the production app entry.
// Uses synthetic identity against localhost only; all stores/screens are real.
import React from 'react';
import { Text, View } from 'react-native';
import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const context = require.context('../app');
function QaRoot() {
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    void (async () => {
      if (process.env.EXPO_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:55439') {
        throw new Error('QA entry requires the isolated localhost fixture server');
      }
      // A new explicit QA run can seed once without reinstalling the app or
      // resetting native Calendar permissions. Cold launches in that run do
      // not reseed, so logout/persistence checks remain meaningful.
      const runId = process.env.EXPO_PUBLIC_QA_RUN_ID || 'default';
      const seededKey = `ishift:qa:seeded:${runId}`;
      if (!await AsyncStorage.getItem(seededKey)) {
        const response = await fetch('http://127.0.0.1:55439/qa/session');
        if (!response.ok) throw new Error('QA fixture server unavailable');
        const session = await response.json();
        await SecureStore.setItemAsync('sb-127-auth-token', JSON.stringify(session));
        await SecureStore.deleteItemAsync('ishift.offline-read.local-signout');
        await AsyncStorage.setItem(seededKey, 'true');
        await AsyncStorage.setItem('shiftsnap_locale', process.env.EXPO_PUBLIC_QA_LOCALE || 'en');
      }
      setReady(true);
    })().catch((e) => setError(String(e)));
  }, []);
  return ready ? <ExpoRoot context={context} /> : <View><Text>{error || 'Preparing isolated QA...'}</Text></View>;
}
registerRootComponent(QaRoot);
