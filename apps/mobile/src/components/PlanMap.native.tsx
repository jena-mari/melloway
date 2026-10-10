import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Constants from 'expo-constants';
import { colors, common } from '../theme';
import type { PlanMapProps } from './PlanMap.types';

export default function PlanMap({ stops, onSelectVenue }: PlanMapProps) {
  const map = useRef<MapView>(null);
  const coordinates = useMemo(() => stops.map(v => ({ latitude: v.lat, longitude: v.lng })), [stops]);
  const fit = useCallback(() => map.current?.fitToCoordinates(coordinates, { edgePadding: { top: 45, right: 45, bottom: 45, left: 45 }, animated: false }), [coordinates]);
  useEffect(() => { fit(); }, [fit]); // Refits after regeneration or a stop swap.
  const googleIOS = Constants.appOwnership !== 'expo' && Constants.expoConfig?.extra?.googleMapsIOS;
  return <View style={[common.card, styles.container]}>
    <Text style={common.label}>ur little Sydney adventure</Text>
    <MapView ref={map} provider={Platform.OS === 'android' || googleIOS ? PROVIDER_GOOGLE : undefined}
      style={styles.map} onMapReady={fit} initialRegion={{ latitude: -33.872, longitude: 151.208, latitudeDelta: .06, longitudeDelta: .06 }}>
      {stops.map((v, i) => <Marker key={v.id} coordinate={{ latitude: v.lat, longitude: v.lng }}
        title={`${i + 1}. ${v.name}`} description={v.source === 'demo' ? 'Approximate demo pin · tap for details' : 'Google Places · tap for details'} pinColor={colors.ink}
        onCalloutPress={() => onSelectVenue(v.id)} />)}
    </MapView>
    <Text style={common.fine}>Approximate venue pins only. Travel estimates are not walking or transit directions. Open Google Maps to check the actual route.</Text>
  </View>;
}
const styles = StyleSheet.create({ container: { padding: 16 }, map: { height: 280, width: '100%', borderRadius: 14 } });
