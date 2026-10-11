import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Constants from 'expo-constants';
import { areas } from '@melloway/domain';
import { colors } from '../../theme';
import type { AreaMapProps } from './AreaMap.types';

export default function AreaMap({ area, onSelect }: AreaMapProps) {
  const selected = areas[area] ?? areas['Anywhere in Sydney'];
  const googleIOS = Constants.appOwnership !== 'expo' && Constants.expoConfig?.extra?.googleMapsIOS;
  return <View style={styles.clip}>
    <MapView accessibilityLabel="Sydney area centres. Choose an area using its pin or the suggestions." style={styles.map}
      provider={Platform.OS === 'android' || googleIOS ? PROVIDER_GOOGLE : undefined}
      region={{ latitude: selected.lat, longitude: selected.lng, latitudeDelta: .065, longitudeDelta: .09 }}>
      {Object.entries(areas).filter(([name]) => name !== 'Anywhere in Sydney').map(([name, location]) => <Marker key={name}
        coordinate={{ latitude: location.lat, longitude: location.lng }} title={name} description="Area centre"
        pinColor={name === area ? colors.ink : '#888888'} onPress={() => onSelect(name)} />)}
    </MapView>
  </View>;
}
const styles = StyleSheet.create({ clip: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: '#e4e4e4' }, map: { width: '100%', height: 200 } });
