import { MaterialIcons } from '@expo/vector-icons';

type Icon = keyof typeof MaterialIcons.glyphMap;

export const channels: { label: string; icon: Icon; on: boolean }[] = [
  { label: '푸시', icon: 'notifications', on: true },
  { label: '카카오톡', icon: 'chat-bubble', on: true },
  { label: '이메일', icon: 'mail', on: false },
];

export type Notif = {
  title: string;
  sub: string;
  time: string;
  tone: 'accent' | 'good' | 'bad' | 'tert';
  icon: Icon;
  unread: boolean;
};

export const feed: { date: string; items: Notif[] }[] = [
  {
    date: '오늘 — 6월 26일',
    items: [
      { title: '오늘의 픽 5종목 발행', sub: '검증 통과 5종목이 발행됐어요. 지금 확인하세요.', time: '08:30', tone: 'accent', icon: 'campaign', unread: true },
      { title: '한미반도체 신규 시그널', sub: '눌림목 셋업 트리거 — 진입가 118,200 도달', time: '09:05', tone: 'good', icon: 'show-chart', unread: true },
      { title: '삼성전자 판정 변경', sub: 'AI 판정 중립 → 매수 상향', time: '11:20', tone: 'accent', icon: 'swap-horiz', unread: true },
      { title: '모닝 브리프', sub: '오늘의 시장 레짐: 하락추세 · 수급·역추세 위주', time: '07:00', tone: 'tert', icon: 'wb-sunny', unread: false },
    ],
  },
  {
    date: '어제 — 6월 25일',
    items: [
      { title: '픽 확정 — 한미반도체 목표 달성', sub: '+12.4% 목표가 도달 · 청산 처리', time: '14:42', tone: 'good', icon: 'check-circle', unread: false },
      { title: '픽 확정 — 포스코퓨처엠 손절', sub: '−7.8% 손절가 도달 · 청산 처리', time: '10:18', tone: 'bad', icon: 'cancel', unread: false },
      { title: '모닝 브리프', sub: '오늘의 시장 레짐: 횡보 · 변동성 축소', time: '07:00', tone: 'tert', icon: 'wb-sunny', unread: false },
    ],
  },
];
