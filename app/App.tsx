import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

export type AppProps = {
  bundleVersion?: number;
};

function App(props: AppProps) {
  const isDarkMode = useColorScheme() === 'dark';

  const [version, setVersion] = useState<number | null>(
    props.bundleVersion ?? null,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadVersion() {
      try {
        const baseUrl = 'https://1d7b9c736279.ngrok-free.app';

        const res = await fetch(
          `${baseUrl}/bundle/latest?platform=${Platform.OS}`,
        );
        if (!res.ok) {
          return;
        }

        const json = await res.json();
        const latestVersion = json?.latest?.version;

        if (!cancelled && typeof latestVersion === 'number') {
          setVersion(latestVersion);
        }
      } catch {}
    }

    if (version == null) {
      loadVersion();
    }

    return () => {
      cancelled = true;
    };
  }, [version]);

  const versionLabel = version ?? 1;

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={styles.container}>
        <Text style={styles.text}>codepush version: {versionLabel}</Text>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  text: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
});

export default App;
