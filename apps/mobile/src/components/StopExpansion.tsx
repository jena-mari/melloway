import { useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Animated, Platform } from 'react-native';
import { colors } from '../theme';

export default function StopExpansion({ children, name }: PropsWithChildren<{ name: string }>) {
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!active || reduced) return;
      opacity.setValue(0.85);
      animation = Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' });
      animation.start();
    }).catch(() => {});
    return () => { active = false; animation?.stop(); };
  }, [opacity]);
  return <Animated.View accessibilityLabel={`${name} stop details`} style={{ opacity, gap: 12, borderTopWidth: 1, borderColor: colors.line, paddingTop: 12 }}>{children}</Animated.View>;
}
