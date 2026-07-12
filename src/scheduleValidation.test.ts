import { describe, expect, it } from 'vitest'
import { isBackupData, isSchedule, normalizeExcludedDates, normalizeHolidayItems } from './scheduleValidation'

const schedule = {
  id: 'schedule-1',
  title: '테스트',
  days: ['mon'],
  startTime: '09:00',
  endTime: '10:00',
  alarmBeforeMinutes: 1,
  sound: 'classic',
  volume: 85,
  color: '#2563eb',
  enabled: true,
  memo: '',
  excludedDates: [],
  excludeHolidays: false,
  oneTimeDate: null,
  oneTimeAt: null,
} as const

describe('scheduleValidation', () => {
  it('normalizes legacy excluded date strings with an empty reason', () => {
    expect(normalizeExcludedDates(['2026-07-06', { date: '2026-07-07', reason: '휴가' }])).toEqual([
      { date: '2026-07-06', reason: '' },
      { date: '2026-07-07', reason: '휴가' },
    ])
  })

  it('accepts a valid schedule and rejects malformed data', () => {
    expect(isSchedule(schedule)).toBe(true)
    expect(isSchedule({ ...schedule, days: ['monday'] })).toBe(false)
  })

  it('validates backup data before restore', () => {
    const backup = {
      app: 'alarm-schedule',
      version: 1,
      exportedAt: '2026-07-12T00:00:00.000Z',
      schedules: [schedule],
      quickTimers: [{ id: 'quick-1', minutes: 30 }],
      theme: 'dark',
      holidayDates: ['2026-08-15'],
    } as const
    expect(isBackupData(backup)).toBe(true)
    expect(isBackupData({ ...backup, version: 2 })).toBe(false)
  })

  it('keeps legacy holiday dates enabled and preserves holiday names', () => {
    expect(normalizeHolidayItems(['2026-08-15', { date: '2026-10-03', name: '개천절', enabled: false }])).toEqual([
      { date: '2026-08-15', name: '', enabled: true },
      { date: '2026-10-03', name: '개천절', enabled: false },
    ])
  })
})
