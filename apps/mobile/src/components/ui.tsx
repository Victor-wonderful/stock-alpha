import { MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { color, radius } from '@/theme/tokens';

export function Card({
  children,
  style,
  accent,
  padding = 18,
}: {
  children: ReactNode;
  style?: ViewStyle;
  /** 강조 카드: 옐로우 테두리 */
  accent?: boolean;
  padding?: number;
}) {
  return (
    <View
      style={[
        styles.card,
        { padding, borderColor: accent ? color.accent : color.border },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Pill({
  label,
  bg = color.surface3,
  fg = color.textSecondary,
  bold = true,
  size = 10,
  left,
}: {
  label: string;
  bg?: string;
  fg?: string;
  bold?: boolean;
  size?: number;
  left?: ReactNode;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {left}
      <Text style={{ color: fg, fontSize: size, fontWeight: bold ? '700' : '600' }}>{label}</Text>
    </View>
  );
}

export function Dot({ c, size = 7 }: { c: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size, backgroundColor: c }} />;
}

export function SectionHeader({
  title,
  action,
  actionColor = color.textSecondary,
  onAction,
}: {
  title: string;
  action?: string;
  actionColor?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8} style={styles.actionRow}>
          <Text style={{ color: actionColor, fontSize: 12, fontWeight: '600' }}>{action}</Text>
          <MaterialIcons name="chevron-right" size={16} color={actionColor} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  tint = color.textSecondary,
  bg = color.surface2,
  border = true,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress?: () => void;
  tint?: string;
  bg?: string;
  border?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={[styles.iconBtn, { backgroundColor: bg, borderWidth: border ? 1 : 0 }]}>
      <MaterialIcons name={icon} size={20} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: color.textPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
