import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { sydneyToday } from '@melloway/domain';
import { validDate } from '../../services/onboarding';
import { colors, fonts } from '../../theme';
import { Choice, choiceAccessibility, onboardingStyles } from './Controls';

const calendarDay = (iso: string) => new Date(`${iso}T12:00:00Z`);
const isoDay = (day: Date) => day.toISOString().slice(0, 10);
const monthOf = (day: Date) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1, 12));
const readable = (day: Date) => day.toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export default function DateCalendar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { width } = useWindowDimensions();
  const today = sydneyToday();
  const selected = validDate(value) && value >= today ? value : '';
  const [month, setMonth] = useState(() => monthOf(calendarDay(selected || today)));
  const monthLabel = month.toLocaleDateString('en-AU', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const last = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0, 12)).getUTCDate();
  const offset = (month.getUTCDay() + 6) % 7;
  const previousDisabled = isoDay(month) <= isoDay(monthOf(calendarDay(today)));
  const move = (delta: number) => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + delta, 1, 12)));
  const choose = (iso: string) => { onChange(iso); setMonth(monthOf(calendarDay(iso))); };
  const tomorrow = calendarDay(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return <View style={styles.wrapper}>
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.scroll} style={{ marginHorizontal: -Math.max(0, (308 - (width - 60)) / 2) }}>
      <View style={styles.calendar}>
        <View style={styles.heading}>
          <Pressable accessibilityRole="button" accessibilityLabel="previous month" aria-disabled={previousDisabled} accessibilityState={{ disabled: previousDisabled }} disabled={previousDisabled} onPress={() => move(-1)} style={styles.arrow}><Text style={[styles.arrowText, previousDisabled && styles.disabled]}>‹</Text></Pressable>
          <Text accessibilityLiveRegion="polite" style={styles.month}>{monthLabel}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="next month" onPress={() => move(1)} style={styles.arrow}><Text style={styles.arrowText}>›</Text></Pressable>
        </View>
        <View style={styles.week}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
        {Array.from({ length: Math.ceil((offset + last) / 7) }, (_, row) => <View key={row} style={styles.week}>
          {Array.from({ length: 7 }, (_, col) => {
            const n = row * 7 + col - offset + 1;
            if (n < 1 || n > last) return <View key={col} style={styles.cell} />;
            const date = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), n, 12));
            const iso = isoDay(date), disabled = iso < today, active = iso === selected;
            return <Pressable key={col} accessibilityRole="button" accessibilityLabel={readable(date)} {...choiceAccessibility(active)} aria-disabled={disabled} accessibilityState={{ selected: active, disabled }} disabled={disabled}
              onPress={() => choose(iso)} style={[styles.cell, iso === today && styles.today, active && onboardingStyles.selected]}>
              <Text style={[styles.day, disabled && styles.disabled, active && onboardingStyles.selectedText]}>{n}</Text>
            </Pressable>;
          })}
        </View>)}
      </View>
    </ScrollView>
    <View style={styles.shortcuts}>
      <Choice label="today" selected={selected === today} onPress={() => choose(today)} />
      <Choice label="tomorrow" selected={selected === isoDay(tomorrow)} onPress={() => choose(isoDay(tomorrow))} />
      <Choice label="not sure yet" selected={!selected} onPress={() => onChange('')} />
    </View>
    <Text accessibilityLiveRegion="polite" style={onboardingStyles.fine}>{selected ? readable(calendarDay(selected)) : 'no day picked · we’ll use today'}</Text>
  </View>;
}
const styles = StyleSheet.create({
  wrapper: { gap: 12 }, scroll: { flexGrow: 1, justifyContent: 'center' },
  calendar: { minWidth: 308, flex: 1, borderWidth: 1, borderColor: '#e4e4e4', borderRadius: 22, paddingVertical: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: colors.ink, fontSize: 26 }, month: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink, flexShrink: 1, textAlign: 'center' },
  week: { flexDirection: 'row' }, weekday: { flex: 1, minWidth: 44, fontFamily: fonts.regular, color: colors.muted, fontSize: 10, textAlign: 'center', paddingVertical: 8 },
  cell: { flex: 1, minWidth: 44, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1, borderColor: colors.ink }, day: { fontFamily: fonts.regular, color: colors.ink, fontSize: 13 }, disabled: { color: '#b7b7b7' },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
