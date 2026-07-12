import { describe, expect, it } from 'vitest'
import { getMissedAlarmTitles, sortOneTimeSchedules } from './alarmUtils'
import type { Schedule } from './types'

const makeSchedule = (id: string, oneTimeDate: string | null, startTime: string): Schedule => ({
  id,
  title: id,
  days: ['mon'],
  startTime,
  endTime: '10:00',
  alarmBeforeMinutes: 0,
  sound: 'classic',
  volume: 80,
  color: '#2563eb',
  enabled: true,
  memo: '',
  excludedDates: [],
  excludeHolidays: false,
  oneTimeDate,
  oneTimeAt: null,
})

describe('alarmUtils', () => {
  it('sorts one-time schedules by their next alarm time', () => {
    const current = new Date(2026, 6, 5, 8, 0).getTime()
    const schedules = [
      makeSchedule('later', '2026-07-06', '09:00'),
      makeSchedule('earlier', '2026-07-06', '08:30'),
    ]
    expect(sortOneTimeSchedules(schedules, current, []).map(({ schedule }) => schedule.id)).toEqual([
      'earlier',
      'later',
    ])
  })

  it('reports alarms missed during a long background pause', () => {
    const previous = new Date(2026, 6, 5, 8, 0).getTime()
    const current = new Date(2026, 6, 6, 0, 11).getTime()
    const schedule = makeSchedule('missed', null, '00:10')
    expect(getMissedAlarmTitles([schedule], previous, current, [])).toEqual(['missed'])
  })
})
