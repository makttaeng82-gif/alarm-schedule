export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type SoundKey =
  | 'classic'
  | 'school'
  | 'soft'
  | 'digital'
  | 'urgent'
  | 'chime'
  | 'morning'
  | 'beep'
  | 'siren'
  | 'pulse'

export type Theme = 'light' | 'dark'

export type Schedule = {
  id: string
  title: string
  days: DayKey[]
  startTime: string
  endTime: string
  alarmBeforeMinutes: number
  sound: SoundKey
  volume: number
  color: string
  enabled: boolean
  memo: string
  excludedDates: string[]
  excludeHolidays: boolean
  oneTimeDate: string | null
}

export type ScheduleForm = Omit<Schedule, 'id'>

export type ActiveAlarm = Pick<
  Schedule,
  'id' | 'title' | 'startTime' | 'alarmBeforeMinutes' | 'color'
>

export type TimePickerProps = {
  value: string
  onChange: (time: string) => void
}

export type QuickTimer = {
  id: string
  minutes: number
}

export type BackupData = {
  app: 'alarm-schedule'
  version: 1
  exportedAt: string
  schedules: Schedule[]
  quickTimers: QuickTimer[]
  theme: Theme
  holidayDates?: string[]
}

export type NotificationStatus = NotificationPermission | 'unsupported'

export type HelpKey = 'schedule' | 'days' | 'time' | 'alarm' | 'timer' | 'week' | 'list'
