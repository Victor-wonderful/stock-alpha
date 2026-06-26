import { Text, View } from 'react-native';

import { Screen, NavHeader } from '@/components/screen';
import { color } from '@/theme/tokens';

/** 구현 예정 화면 임시 표시 (탭/상세 라우트 스캐폴드용) */
export function Stub({ title, detail = false }: { title: string; detail?: boolean }) {
  return (
    <Screen header={detail ? <NavHeader title={title} /> : undefined}>
      {!detail ? (
        <Text style={{ fontSize: 26, fontWeight: '700', color: color.textPrimary }}>{title}</Text>
      ) : null}
      <View
        style={{
          marginTop: 24,
          padding: 24,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: color.border,
          backgroundColor: color.surface,
          alignItems: 'center',
        }}>
        <Text style={{ color: color.textSecondary, fontSize: 14, fontWeight: '600' }}>
          {title} — 구현 예정
        </Text>
        <Text style={{ color: color.textTertiary, fontSize: 12, marginTop: 6, textAlign: 'center' }}>
          목업(design/stock-alpha-ui.pen) 기준으로 순차 구현됩니다.
        </Text>
      </View>
    </Screen>
  );
}
