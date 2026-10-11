import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { localAreas } from '../../services/onboarding';
import { colors, fonts } from '../../theme';
import AreaMap from './AreaMap';
import { Choice, Input, onboardingStyles } from './Controls';

export default function AreaSearch({ area, query, onQuery, onSelect }: { area: string; query: string; onQuery: (query: string) => void; onSelect: (area: string) => void }) {
  const [searching, setSearching] = useState(false);
  function select(name: string) { onSelect(name); setSearching(false); Keyboard.dismiss(); }
  const suggestions = localAreas(query);
  return <View style={styles.wrapper}>
    <Input label="Sydney starting area" placeholder="search a Sydney area" value={query} autoCorrect={false} onFocus={() => setSearching(true)} onChangeText={text => { onQuery(text); setSearching(true); }} />
    {searching && <View style={styles.suggestions}>
      {suggestions.map(name => <Pressable key={name} accessibilityRole="button" accessibilityLabel={`choose ${name}`} onPress={() => select(name)} style={styles.suggestion}><Text style={styles.text}>{name}</Text></Pressable>)}
      {!suggestions.length && <Text style={[onboardingStyles.fine, { padding: 12 }]}>No matching area. Choose a listed Sydney area or leave it open.</Text>}
    </View>}
    <Choice label="anywhere in Sydney" selected={area === 'Anywhere in Sydney' && !query} onPress={() => select('Anywhere in Sydney')} />
    <Text style={onboardingStyles.fine}>{query === area ? `around ${area}` : 'Sydney areas · choose a suggestion'}</Text>
    <AreaMap area={area} onSelect={select} />
  </View>;
}
const styles = StyleSheet.create({ wrapper: { gap: 14 }, suggestions: { borderWidth: 1, borderColor: '#e4e4e4', borderRadius: 18, overflow: 'hidden' }, suggestion: { minHeight: 48, padding: 12, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e4e4e4' }, text: { fontFamily: fonts.regular, color: colors.ink, fontSize: 14 } });
