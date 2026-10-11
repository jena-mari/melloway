// Web fallback. Metro resolves PlanMap.native.tsx on iOS and Android.
import { Text, View } from 'react-native';
import { common } from '../theme';
import { Button } from './UI';
import type { PlanMapProps } from './PlanMap.types';

export default function PlanMap({ stops, onSelectVenue, selectedId }: PlanMapProps) {
  return <View style={common.card}>
    <Text style={common.label}>the dots, in order.</Text>
    <Text style={common.fine}>Interactive pins are available in the native app. Demo coordinates are approximate; travel times are geographic estimates.</Text>
    {stops.map((v, i) => <Button key={v.id} label={`${String.fromCharCode(65 + i)}. ${v.name}`} tone={selectedId === v.id ? 'pink' : 'green'} onPress={() => onSelectVenue(v.id)} />)}
  </View>;
}
