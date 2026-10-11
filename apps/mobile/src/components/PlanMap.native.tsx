import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, Modal } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Constants from 'expo-constants';
import { colors, common } from '../theme';
import type { PlanMapProps } from './PlanMap.types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './UI';
import { routePaths } from '../services/routePaths';
import { useQuery } from '@tanstack/react-query';

export default function PlanMap({ stops, onSelectVenue, selectedId, prefs }: PlanMapProps) {
  const [expanded, setExpanded] = useState(false);
  const routes = useQuery({ queryKey: ['itinerary-paths', stops, prefs], enabled: !!prefs,
    queryFn: ({ signal }) => routePaths(stops, prefs!, signal), retry: false, staleTime: 60000 });
  const map = useRef<MapView>(null);
  const coordinates = useMemo(() => stops.map(v => ({ latitude: v.lat, longitude: v.lng })), [stops]);
  const fittedCoordinates = useMemo(() => [...coordinates, ...(routes.data?.paths.flat() || [])], [coordinates, routes.data]);
  const fit = useCallback(() => map.current?.fitToCoordinates(fittedCoordinates, { edgePadding: { top: 45, right: 45, bottom: 45, left: 45 }, animated: false }), [fittedCoordinates]);
  useEffect(() => { fit(); }, [fit]); // Refits after regeneration or a stop swap.
  const googleIOS = Constants.appOwnership !== 'expo' && Constants.expoConfig?.extra?.googleMapsIOS;
  function renderMap(full = false) { return <MapView ref={map} provider={Platform.OS === 'android' || googleIOS ? PROVIDER_GOOGLE : undefined}
      style={full ? { flex: 1 } : styles.map} onMapReady={fit} initialRegion={{ latitude: -33.872, longitude: 151.208, latitudeDelta: .06, longitudeDelta: .06 }}>
      {routes.data?.paths.map((path, index) => <Polyline key={index} coordinates={path} strokeWidth={5} strokeColor={colors.ink} />)}
      {stops.map((v, i) => <Marker key={v.id} coordinate={{ latitude: v.lat, longitude: v.lng }}
        title={`${String.fromCharCode(65 + i)}. ${v.name}`} description={v.source === 'demo' ? 'Approximate demo pin' : v.address}
        onPress={() => onSelectVenue(v.id)}>
        <View style={[styles.marker, selectedId === v.id && { backgroundColor: colors.pink }]}><Text style={styles.markerText}>{String.fromCharCode(65 + i)}</Text></View>
      </Marker>)}
    </MapView>; }
  return <View style={[common.card, styles.container]}>
    <Text style={common.label}>ur little Sydney adventure</Text>
    {!expanded && renderMap()}
    <Text style={common.fine}>{routes.isFetching ? 'loading route…' : routes.data?.paths.length ? `${prefs?.transport} route${routes.data.partial ? ' · some connections unavailable' : ''} · confirm directions before heading out.` : 'Venue pins · choose transport and use live mode for route lines. Times are estimates.'}</Text>
    <Button label="expand map" tone="cream" onPress={() => setExpanded(true)} />
    <Modal visible={expanded} onRequestClose={() => setExpanded(false)} animationType="none">
      <SafeAreaView style={{ flex: 1 }}><Button label="close map" tone="cream" onPress={() => setExpanded(false)} />{expanded && renderMap(true)}</SafeAreaView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({ container: { padding: 16 }, map: { height: 280, width: '100%', borderRadius: 14 },
  marker: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.cream, borderColor: colors.ink, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  markerText: { fontWeight: '700', color: colors.ink, fontSize: 18 } });
