import { Text, View } from 'react-native';
import { localAreas } from '../../services/onboarding';
import { Choices, onboardingStyles } from './Controls';
import type { AreaMapProps } from './AreaMap.types';

// Metro selects the interactive native map on iOS/Android.
export default function AreaMap({ area, onSelect }: AreaMapProps) {
  return <View style={{ gap: 8 }}>
    <Text style={onboardingStyles.fine}>choose an area · interactive map available in Expo Go</Text>
    <Choices options={localAreas('')} value={area} onChange={onSelect} />
  </View>;
}
