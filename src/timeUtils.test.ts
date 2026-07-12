import { describe, expect, it } from 'vitest'
import {
  formatAlarm,
  getDueAlarmOccurrence,
  getNextAlarmOccurrence,
  getStartTimeChange,
  getQuickTimerTargetDate,
  isScheduleExcludedOnDate,
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
  excludedDates: [],
  excludeHolidays: false,
  oneTimeDate: null,
  oneTimeAt: null,
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

  it('skips an excluded date from a repeating schedule', () => {
    const schedule = { ...baseSchedule, excludedDates: [{ date: '2026-07-06', reason: '' }] }
    const currentDate = new Date(2026, 6, 5, 23, 39, 50)
    const occurrence = getNextAlarmOccurrence(schedule, currentDate)

    expect(occurrence ? localStamp(occurrence.startDate) : null).toBe('2026-07-13-00-10-00')
  })

  it('does not return a due alarm on an excluded date', () => {
    const schedule = { ...baseSchedule, excludedDates: [{ date: '2026-07-06', reason: '' }] }
    const currentDate = new Date(2026, 6, 5, 23, 40, 20)
    expect(getDueAlarmOccurrence(schedule, currentDate)).toBeNull()
  })

  it('skips a registered holiday when holiday exclusion is enabled', () => {
    const schedule = { ...baseSchedule, excludeHolidays: true }
    const currentDate = new Date(2026, 6, 5, 23, 39, 50)
    const occurrence = getNextAlarmOccurrence(schedule, currentDate, ['2026-07-06'])

    expect(occurrence ? localStamp(occurrence.startDate) : null).toBe('2026-07-13-00-10-00')
  })

  it('treats an excluded date as blocked for saved schedules', () => {
    const schedule = { ...baseSchedule, excludedDates: [{ date: '2026-07-06', reason: '' }] }
    expect(isScheduleExcludedOnDate(schedule, new Date(2026, 6, 6))).toBe(true)
  })

  it('limits a one-time timer to its saved date', () => {
    const schedule = { ...baseSchedule, oneTimeDate: '2026-07-06' }
    const currentDate = new Date(2026, 6, 13, 0, 0)
    expect(getNextAlarmOccurrence(schedule, currentDate)).toBeNull()
  })

  it('rounds a quick timer up to the first safe whole minute after its duration', () => {
    const now = new Date(2026, 6, 5, 12, 0, 20, 500)
    expect(localStamp(getQuickTimerTargetDate(now, 1))).toBe('2026-07-05-12-02-00')
  })

  it('never creates a quick timer target in the past', () => {
    const now = new Date(2026, 6, 5, 23, 59, 59, 999)
    expect(getQuickTimerTargetDate(now, 1).getTime()).toBeGreaterThan(now.getTime())
  })

  it('uses the exact timestamp for a one-time timer', () => {
    const schedule = {
      ...baseSchedule,
      days: ['mon'] as Schedule['days'],
      alarmBeforeMinutes: 0,
      oneTimeDate: '2026-07-06',
      oneTimeAt: new Date(2026, 6, 6, 0, 11, 20).toISOString(),
    }
    const occurrence = getNextAlarmOccurrence(schedule, new Date(2026, 6, 6, 0, 10, 0))
    expect(occurrence?.startDate.getSeconds()).toBe(20)
  })
})
