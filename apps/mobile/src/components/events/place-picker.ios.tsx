import { geocodeAsync, reverseGeocodeAsync, type LocationGeocodedAddress } from 'expo-location';
import { Redirect, router, Stack } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import MapView, { Marker, type LatLng } from 'react-native-maps';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SearchBarCommands } from 'react-native-screens';
import { radius, textStyles, useAppTheme } from '@/constants/tokens';
import { useEventPlace } from './event-place-context';

const singapore = { latitude: 1.3521, longitude: 103.8198, latitudeDelta: 0.32, longitudeDelta: 0.32 };
type Place = { coordinate: LatLng; title: string; address: string; value: string };

function describePlace(coordinate: LatLng, address: LocationGeocodedAddress): Place | null {
  // Require the geocoder's country code for both search results and map taps.
  if (address.isoCountryCode?.toUpperCase() !== 'SG') return null;
  const street = [address.streetNumber, address.street].filter(Boolean).join(' ');
  const locality = [address.city || address.country, address.postalCode].filter(Boolean).join(' ');
  const parts = [...new Set([address.name, street, locality].filter((part): part is string => !!part))];
  if (!parts.length) return null;
  return { coordinate, title: parts[0], address: parts.slice(1).join(', '), value: parts.join(', ') };
}

export default function PlacePicker() {
  const t = useAppTheme();
  const dark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const reduceMotion = useReducedMotion();
  const { draft } = useEventPlace();
  const [query, setQuery] = useState(draft?.venue ?? '');
  const [place, setPlace] = useState<Place | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [panelHeight, setPanelHeight] = useState(0);
  const searchBar = useRef<SearchBarCommands>(null);
  const initialVenue = useRef(draft?.venue ?? '');
  useEffect(() => { searchBar.current?.setText(initialVenue.current); }, []);
  const map = useRef<MapView>(null);
  // Ignore late lookups after typing, another selection, saving, or dismissal.
  const request = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => () => { request.current += 1; }, []);

  const close = () => { request.current += 1; router.back(); };
  const choose = () => {
    if (!place || busy) return;
    request.current += 1;
    draft?.onChoose(place.value);
    router.back();
  };
  const changeQuery = (text: string) => {
    request.current += 1;
    setQuery(text);
    setPlace(null);
    setMessage('');
  };

  const findPlace = async (coordinate?: LatLng) => {
    const text = query.trim();
    if (inFlight.current || (!coordinate && !text)) return;
    inFlight.current = true;
    const id = ++request.current;
    Keyboard.dismiss();
    searchBar.current?.blur();
    setBusy(true);
    setMessage('');
    setPlace(null);
    try {
      // Address search is scoped to the app's Singapore groups. No device-location permission is needed.
      const point = coordinate ?? (await geocodeAsync(/\bsingapore\b/i.test(text) ? text : `${text}, Singapore`))[0];
      if (id !== request.current) return;
      if (!point) {
        setMessage('No address found. Try a street or postal code.');
        return;
      }
      const addresses = await reverseGeocodeAsync(point);
      if (id !== request.current) return;
      if (addresses[0] && addresses[0].isoCountryCode?.toUpperCase() !== 'SG') {
        setMessage('Choose an address in Singapore. Search again or tap a place within Singapore.');
        return;
      }
      const selected = addresses[0] ? describePlace(point, addresses[0]) : null;
      if (!selected) {
        setMessage('No address found here. Try another spot or search for a street or postal code.');
        return;
      }
      setPlace(selected);
      map.current?.animateToRegion({ ...point, latitudeDelta: 0.008, longitudeDelta: 0.008 }, reduceMotion ? 0 : 350);
    } catch {
      if (id === request.current) setMessage('Could not look up this address. Check your connection and search again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (!draft) return <Redirect href="/create-event" />;
  const showPanel = busy || !!place || !!message;

  return <>
    <Stack.SearchBar
      ref={searchBar}
      placeholder="Singapore address or place"
      placement="integrated"
      allowToolbarIntegration={false}
      hideNavigationBar={false}
      hideWhenScrolling={false}
      obscureBackground={false}
      onChangeText={(event) => changeQuery(event.nativeEvent.text)}
      onSearchButtonPress={() => void findPlace()}
      onCancelButtonPress={() => { searchBar.current?.clearText(); changeQuery(''); }}
    />
    <Stack.Toolbar placement="left" tintColor={t.ink}>
      <Stack.Toolbar.Button accessibilityLabel="Close place picker" icon="xmark" separateBackground onPress={close} />
    </Stack.Toolbar>
    <View style={styles.root}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        mapPadding={{ top: headerHeight, right: 0, bottom: showPanel ? panelHeight + insets.bottom + 16 : insets.bottom, left: 0 }}
        legalLabelInsets={{ top: 0, right: 0, bottom: showPanel ? panelHeight + insets.bottom + 16 : insets.bottom, left: 8 }}
        initialRegion={singapore}
        onPress={(event) => { if (event.nativeEvent.action !== 'marker-press') void findPlace(event.nativeEvent.coordinate); }}
        showsUserLocation={false}
        showsCompass
        showsScale
        loadingEnabled
        loadingIndicatorColor={t.ink}
        loadingBackgroundColor={t.background}
        accessibilityLabel="Map of Singapore. Tap a place to select its address, or use the search field."
      >
        {place ? <Marker coordinate={place.coordinate} title={place.title} description={place.address} /> : null}
      </MapView>
      {showPanel ? <KeyboardAvoidingView pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.panelOverlay]} behavior="padding">
      <ScrollView
        onLayout={(event) => setPanelHeight(event.nativeEvent.layout.height)}
        style={[styles.panel, { backgroundColor: t.surface, marginBottom: Math.max(insets.bottom, 16) }]}
        contentContainerStyle={styles.panelContent}
        keyboardShouldPersistTaps="handled"
      >
        {busy ? <View accessibilityRole="progressbar" accessibilityLabel="Finding place" style={styles.loading}>
          <ActivityIndicator color={t.ink} />
          <Text style={[textStyles.body, { color: t.muted }]}>Finding place…</Text>
        </View> : place ? <>
          <Text accessibilityRole="header" style={[textStyles.section, { color: t.ink }]}>{place.title}</Text>
          {place.address ? <Text style={[textStyles.body, { color: t.muted }]}>{place.address}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={choose}
            style={({ pressed }) => [styles.selectButton, { backgroundColor: dark ? '#FFFFFF' : '#000000', opacity: pressed ? 0.75 : 1 }]}
          >
            <Text style={[textStyles.button, { color: dark ? '#000000' : '#FFFFFF' }]}>Select</Text>
          </Pressable>
        </> : <Text accessibilityRole={message ? 'alert' : undefined} style={[textStyles.body, { color: t.muted }]}>
          {message || 'Search for an address or tap a place on the map.'}
        </Text>}
      </ScrollView>
      </KeyboardAvoidingView> : null}
    </View>
  </>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  panelOverlay: { justifyContent: 'flex-end' },
  panel: { flexGrow: 0, flexShrink: 1, maxHeight: '42%', marginHorizontal: 16, borderRadius: radius.lg },
  panelContent: { padding: 16, gap: 8 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  selectButton: { alignSelf: 'stretch', marginTop: 8, minHeight: 50, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
});
