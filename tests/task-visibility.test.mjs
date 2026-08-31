import test from 'node:test'
import assert from 'node:assert/strict'
import { isActiveTask, isAssignedToMe, isCalendarTask, isCounterpartTask, isHomeCategory, isHomeViewTask, isHouseholdTask, isMyTask, isPrimaryTask, isVisibleOccurrence } from '../src/lib/taskVisibility.js'

const yanely = 'yanely'
const jordan = 'jordan'
const task = overrides => ({ created_by_uid: yanely, assignment_type: 'member', assignee_uids: [yanely], ...overrides })

test('My Tasks contains individual assignments but excludes Home, Pets, and Garden for either user', () => {
  assert.equal(isMyTask(task({ assignee_uids: [yanely] }), yanely), true)
  assert.equal(isMyTask(task({ assignee_uids: [jordan] }), yanely), false)
  assert.equal(isMyTask(task({ assignment_type: 'household', assignee_uids: [yanely, jordan] }), yanely), false)
  for (const category of ['Home', 'Pets', 'Garden', ' home ']) {
    assert.equal(isMyTask(task({ assignee_uids: [yanely] }), yanely, category), false)
    assert.equal(isMyTask(task({ created_by_uid: jordan, assignee_uids: [jordan] }), jordan, category), false)
  }
})

test('counterpart tasks are every individual handoff created by the current user', () => {
  assert.equal(isCounterpartTask(task({ assignee_uids: [jordan] }), yanely, jordan), true)
  assert.equal(isCounterpartTask(task({ created_by_uid: jordan, assignee_uids: [jordan] }), yanely, jordan), false)
  assert.equal(isCounterpartTask(task({ assignment_type: 'household', assignee_uids: [yanely, jordan] }), yanely, jordan), false)
  assert.equal(isCounterpartTask(task({ created_by_uid: jordan, assignee_uids: [yanely] }), jordan, yanely), true)
})

test('Assigned to Me contains only individual tasks created by the other user', () => {
  assert.equal(isAssignedToMe(task({ created_by_uid: jordan, assignee_uids: [yanely] }), yanely), true)
  assert.equal(isAssignedToMe(task({ created_by_uid: yanely, assignee_uids: [jordan] }), jordan), true)
  assert.equal(isAssignedToMe(task({ created_by_uid: yanely, assignee_uids: [yanely] }), yanely), false)
  assert.equal(isAssignedToMe(task({ created_by_uid: jordan, assignment_type: 'household', assignee_uids: [yanely, jordan] }), yanely), false)
})

test('primary views contain current-member and household tasks but hide counterpart-only tasks', () => {
  const household = task({ assignment_type: 'household', assignee_uids: [yanely, jordan] })
  assert.equal(isHouseholdTask(household), true)
  assert.equal(isPrimaryTask(household, yanely), true)
  assert.equal(isPrimaryTask(task({ assignee_uids: [yanely] }), yanely), true)
  assert.equal(isPrimaryTask(task({ assignee_uids: [jordan] }), yanely), false)
})

test('Home contains the three home categories and every Household task', () => {
  for (const category of ['Home', 'Pets', 'Garden']) {
    assert.equal(isHomeCategory(category), true)
    assert.equal(isHomeViewTask(task({ assignee_uids: [yanely] }), category), true)
    assert.equal(isHomeViewTask(task({ created_by_uid: jordan, assignee_uids: [jordan] }), category), true)
  }
  assert.equal(isHomeViewTask(task({ assignment_type: 'household', assignee_uids: [yanely, jordan] }), 'Personal'), true)
  assert.equal(isHomeViewTask(task({ assignee_uids: [yanely] }), 'Personal'), false)
})

test('Calendar excludes Home, Pets, and Garden but keeps every other category', () => {
  for (const category of ['Home', 'Pets', 'Garden']) assert.equal(isCalendarTask(category), false)
  for (const category of ['Personal', 'Errands', 'The Crystal Princess', '']) assert.equal(isCalendarTask(category), true)
})

test('completed recurring occurrences stay in history but disappear from task lists', () => {
  assert.equal(isVisibleOccurrence(task({ recurring_definition_id: 'repeat-one', status: 'completed' })), false)
  assert.equal(isVisibleOccurrence(task({ recurring_definition_id: 'repeat-one', status: 'not_started' })), true)
  assert.equal(isVisibleOccurrence(task({ recurring_definition_id: null, status: 'completed' })), true)
})

test('completed regular tasks leave every active list and remain available to the Completed archive', () => {
  assert.equal(isActiveTask(task({ status: 'completed', recurring_definition_id: null })), false)
  assert.equal(isActiveTask(task({ status: 'not_started', recurring_definition_id: null })), true)
  assert.equal(isActiveTask(task({ status: 'in_progress', recurring_definition_id: null })), true)
  assert.equal(isVisibleOccurrence(task({ status: 'completed', recurring_definition_id: null })), true)
})
