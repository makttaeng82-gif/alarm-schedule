import type { DayKey, HelpKey, NotificationStatus, QuickTimer, SoundKey } from './types'

export const helpContent: Record<HelpKey, { title: string; body: string }> = {
  schedule: {
    title: '일정 기본 정보',
    body: '일정명, 메모, 색상은 목록과 주간표에서 일정을 구분하기 위한 정보입니다. 알람 사용을 끄면 해당 일정은 저장만 되고 울리지 않습니다.',
  },
  days: {
    title: '요일 선택',
    body: '선택한 요일에만 일정 알람이 동작합니다. 오늘 버튼은 현재 날짜의 요일만 빠르게 선택합니다.',
  },
  time: {
    title: '시작/종료/볼륨',
    body: '시작 시간을 바꾸면 종료 시간은 자동으로 1시간 뒤로 맞춰집니다. 볼륨은 알람 소리 크기에 적용됩니다.',
  },
  alarm: {
    title: '알람 설정',
    body: '알람 전 값은 시작 시간보다 몇 분 먼저 울릴지 정합니다. 소리는 듣기 버튼으로 미리 확인할 수 있습니다.',
  },
  timer: {
    title: '사용자 설정 타이머',
    body: '요일과 무관하게 현재 시각 기준으로 몇 시간 몇 분 뒤 알람을 바로 추가합니다. 만든 타이머는 수정하거나 삭제할 수 있습니다.',
  },
  week: {
    title: '주간표',
    body: '요일별로 등록된 일정을 한눈에 보는 영역입니다. 일정은 시작 시간이 빠른 순서로 표시됩니다.',
  },
  list: {
    title: '알람 목록',
    body: '저장된 모든 일정을 표로 보는 영역입니다. 여기서 알람을 켜거나 끄고, 일정을 수정하거나 삭제할 수 있습니다.',
  },
}

export const notificationLabels: Record<NotificationStatus, string> = {
  granted: '허용됨',
  denied: '차단됨',
  default: '미설정',
  unsupported: '지원 안 함',
}

export const STORAGE_KEY = 'alarm-schedule-items'
export const THEME_KEY = 'alarm-schedule-theme'
export const QUICK_TIMERS_KEY = 'alarm-schedule-quick-timers'
export const HOLIDAY_DATES_KEY = 'alarm-schedule-holiday-dates'

export const days: Array<{ key: DayKey; label: string }> = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
  { key: 'sat', label: '토' },
  { key: 'sun', label: '일' },
]

export const sounds: Array<{ key: SoundKey; label: string }> = [
  { key: 'classic', label: '기본' },
  { key: 'school', label: '학교종' },
  { key: 'soft', label: '부드럽게' },
  { key: 'digital', label: '디지털' },
  { key: 'urgent', label: '긴급' },
  { key: 'chime', label: '차임' },
  { key: 'morning', label: '아침' },
  { key: 'beep', label: '비프' },
  { key: 'siren', label: '사이렌' },
  { key: 'pulse', label: '펄스' },
]

export const colors = [
  '#dc2626',
  '#ea580c',
  '#f59e0b',
  '#eab308',
  '#22c55e',
  '#059669',
  '#14b8a6',
  '#0891b2',
  '#2563eb',
  '#4f46e5',
  '#7c3aed',
  '#db2777',
]

export const defaultQuickTimers: QuickTimer[] = [
  { id: 'quick-30', minutes: 30 },
  { id: 'quick-60', minutes: 60 },
  { id: 'quick-120', minutes: 120 },
  { id: 'quick-180', minutes: 180 },
]

export const timerHourOptions = Array.from({ length: 12 }, (_, index) => index)
export const timerMinuteOptions = Array.from({ length: 60 }, (_, index) => index)
export const dayKeys = days.map((day) => day.key)
export const soundKeys = sounds.map((sound) => sound.key)
