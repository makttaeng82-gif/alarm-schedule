import { describe, expect, it } from 'vitest'
import {
  formatAlarm,
  getDueAlarmOccurrence,
  getNextAlarmOccurrence,
  getStartTimeChange,
} from './timeUtils'
import type { Schedule } from './types'

const baseSchedule: Schedule = {
  id: 'schedule-1',
  title: '자정 테스트',
  days: ['mon'],
  startTime: '00:10',
  endTime: '01:10',
  alarmBeforeMinutes: 30,
  sound: 'classic',
  volume: 85,
  color: '#dc2626',
  enabled: true,
  memo: '',
}

const localStamp = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('-')

describe('timeUtils', () => {
  it('formats alarm time across midnight', () => {
    expect(formatAlarm('00:10', 30)).toBe('23:40')
  })

  it('keeps end time one hour after start time across midnight', () => {
    expect(getStartTimeChange('23:30')).toEqual({
      startTime: '23:30',
      endTime: '00:30',
    })
  })

  it('finds a due alarm on the previous day when a schedule starts after midnight', () => {
    const currentDate = new Date(2026, 6, 5, 23, 40, 20)
    const occurrence = getDueAlarmOccurrence(baseSchedule, currentDate)

    expect(occurrence ? localStamp(occurrence.startDate) : null).toBe('2026-07-06-00-10-00')
    expect(occurrence ? localStamp(occurrence.alarmDate) : null).toBe('2026-07-05-23-40-00')
  })

  it('finds the next alarm using the real alarm date', () => {
    const currentDate = new Date(2026, 6, 5, 23, 39, 50)
    const occurrence = getNextAlarmOccurrence(baseSchedule, currentDate)

    expect(occurrence ? localStamp(occurrence.alarmDate) : null).toBe('2026-07-05-23-40-00')
  })
})
