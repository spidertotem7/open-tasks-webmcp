import test from 'node:test'
import assert from 'node:assert/strict'
import { nextDueDate, occurrenceId, recurrenceUrgency } from '../src/lib/recurrence.js'

test('daily and every-X-day schedules calculate the next date', () => {
  assert.equal(nextDueDate('2026-08-08', { frequency: 'daily' }), '2026-08-09')
  assert.equal(nextDueDate('2026-08-08', { frequency: 'custom', interval: 3 }), '2026-08-11')
})

test('weekly schedules select the next chosen weekday', () => {
  assert.equal(nextDueDate('2026-08-03', { frequency: 'weekly', weekdays: [1, 4] }), '2026-08-06')
  assert.equal(nextDueDate('2026-08-06', { frequency: 'weekly', weekdays: [1, 4] }), '2026-08-10')
})

test('monthly schedules clamp to the final day of shorter months', () => {
  assert.equal(nextDueDate('2027-01-31', { frequency: 'monthly' }), '2027-02-28')
  assert.equal(nextDueDate('2028-01-31', { frequency: 'monthly' }), '2028-02-29')
})

test('occurrence IDs are deterministic for idempotent creation', () => {
  assert.equal(occurrenceId('chores/one', '2026-08-10', '08:30'), occurrenceId('chores/one', '2026-08-10', '08:30'))
})

test('recurring urgency uses calendar-day boundaries', () => {
  assert.equal(recurrenceUrgency('2026-08-07', '2026-08-08'), 'red')
  assert.equal(recurrenceUrgency('2026-08-08', '2026-08-08'), 'red')
  assert.equal(recurrenceUrgency('2026-08-10', '2026-08-08'), 'orange')
  assert.equal(recurrenceUrgency('2026-08-11', '2026-08-08'), 'green')
})
