import test, { after, before } from 'node:test'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { Timestamp, doc, getDoc, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

const projectId = 'task-hub-rules-test'
const household = 'yanely-jordan'
const yanelyId = 'yanely-uid'
const jordanId = 'jordan-uid'
let environment

const taskFields = overrides => ({
  household_id: household,
  title: 'Test task',
  description: '',
  category_id: '',
  status: 'not_started',
  priority: 'medium',
  due_date: '2026-08-08',
  due_time: null,
  assignment_type: 'member',
  assignee_uids: [jordanId],
  created_by_uid: yanelyId,
  created_by_name: 'Yanely',
  created_at: Timestamp.now(),
  updated_at: Timestamp.now(),
  completed_at: null,
  completed_by_uid: null,
  completed_by_name: null,
  recurrence: {},
  recurrence_key: 'test-key',
  recurring_definition_id: null,
  occurrence_due_date: null,
  ...overrides,
})

const definitionFields = overrides => ({
  household_id: household,
  title: 'Give medicine',
  description: '',
  category_id: '',
  status: 'not_started',
  priority: 'medium',
  due_date: '2026-08-08',
  due_time: null,
  assignment_type: 'member',
  assignee_uids: [jordanId],
  created_by_uid: yanelyId,
  created_by_name: 'Yanely',
  recurrence: { frequency: 'custom', interval: 2 },
  schedule: { version: 1, frequency: 'custom', interval: 2, weekdays: [], end_date: null },
  active: true,
  next_due_date: '2026-08-08',
  current_occurrence_id: 'recurring-current',
  last_completed_at: null,
  last_completed_occurrence_id: null,
  created_at: Timestamp.now(),
  updated_at: Timestamp.now(),
  ...overrides,
})

before(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync('firestore.rules', 'utf8') } })
  await environment.withSecurityRulesDisabled(async context => {
    const database = context.firestore()
    await Promise.all([
      setDoc(doc(database, 'members', yanelyId), { household_id: household, display_name: 'Yanely', active: true }),
      setDoc(doc(database, 'members', jordanId), { household_id: household, display_name: 'Jordan', active: true }),
      setDoc(doc(database, 'members', 'outsider-uid'), { household_id: 'another-household', display_name: 'Outsider', active: true }),
      setDoc(doc(database, 'tasks', 'assigned-task'), taskFields()),
      setDoc(doc(database, 'tasks', 'yanely-private'), taskFields({ assignee_uids: [yanelyId] })),
      setDoc(doc(database, 'tasks', 'household-readable'), taskFields({ assignment_type: 'household', assignee_uids: [yanelyId, jordanId] })),
      setDoc(doc(database, 'categories', 'home'), { household_id: household, name: 'Home', position: 0, archived: false, visible_to_uids: [yanelyId, jordanId], created_at: Timestamp.now(), updated_at: Timestamp.now() }),
      setDoc(doc(database, 'categories', 'crystal-princess'), { household_id: household, name: 'The Crystal Princess', position: 5, archived: false, visible_to_uids: [yanelyId], created_at: Timestamp.now(), updated_at: Timestamp.now() }),
    ])
  })
})

test('private tasks stay private while Household tasks are visible to both members', async () => {
  const yanely = environment.authenticatedContext(yanelyId).firestore()
  const jordan = environment.authenticatedContext(jordanId).firestore()
  await assertSucceeds(getDoc(doc(yanely, 'tasks', 'yanely-private')))
  await assertFails(getDoc(doc(jordan, 'tasks', 'yanely-private')))
  await assertSucceeds(getDoc(doc(yanely, 'tasks', 'household-readable')))
  await assertSucceeds(getDoc(doc(jordan, 'tasks', 'household-readable')))
})

after(async () => environment?.cleanup())

test('both household members can create valid tasks and assign household members', async () => {
  const yanely = environment.authenticatedContext(yanelyId).firestore()
  const jordan = environment.authenticatedContext(jordanId).firestore()
  await assertSucceeds(setDoc(doc(yanely, 'tasks', 'yanely-created'), { ...taskFields({ assignee_uids: [jordanId] }), created_at: serverTimestamp(), updated_at: serverTimestamp() }))
  await assertSucceeds(setDoc(doc(jordan, 'tasks', 'jordan-created'), { ...taskFields({ created_by_uid: jordanId, created_by_name: 'Jordan', assignee_uids: [jordanId] }), created_at: serverTimestamp(), updated_at: serverTimestamp() }))
  await assertSucceeds(setDoc(doc(jordan, 'tasks', 'jordan-assigned-yanely'), { ...taskFields({ created_by_uid: jordanId, created_by_name: 'Jordan', assignee_uids: [yanelyId] }), created_at: serverTimestamp(), updated_at: serverTimestamp() }))
  await assertSucceeds(setDoc(doc(yanely, 'tasks', 'household-task'), { ...taskFields({ assignment_type: 'household', assignee_uids: [yanelyId, jordanId] }), created_at: serverTimestamp(), updated_at: serverTimestamp() }))
  await assertFails(setDoc(doc(yanely, 'tasks', 'invalid-double-assignment'), { ...taskFields({ assignment_type: 'member', assignee_uids: [yanelyId, jordanId] }), created_at: serverTimestamp(), updated_at: serverTimestamp() }))
})

test('an assigned household member can persist an entered completion date and completer', async () => {
  const jordan = environment.authenticatedContext(jordanId).firestore()
  const completedAt = Timestamp.fromDate(new Date('2026-08-06T12:00:00Z'))
  await assertSucceeds(updateDoc(doc(jordan, 'tasks', 'assigned-task'), { status: 'completed', completed_at: completedAt, completed_by_uid: yanelyId, completed_by_name: 'Yanely', updated_at: serverTimestamp() }))
  const snapshot = await assertSucceeds(getDoc(doc(jordan, 'tasks', 'assigned-task')))
  assert.equal(snapshot.data().status, 'completed')
  assert.equal(snapshot.data().completed_at.toMillis(), completedAt.toMillis())
  assert.equal(snapshot.data().completed_by_uid, yanelyId)
  const correctedAt = Timestamp.fromDate(new Date('2026-08-05T18:30:00Z'))
  await assertSucceeds(updateDoc(doc(jordan, 'tasks', 'assigned-task'), { completed_at: correctedAt, completed_by_uid: jordanId, completed_by_name: 'Jordan', updated_at: serverTimestamp() }))
  const corrected = await assertSucceeds(getDoc(doc(jordan, 'tasks', 'assigned-task')))
  assert.equal(corrected.data().completed_at.toMillis(), correctedAt.toMillis())
  assert.equal(corrected.data().completed_by_uid, jordanId)
})

test('an assignee can atomically complete a recurring occurrence and create exactly one next occurrence', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const database = context.firestore()
    await setDoc(doc(database, 'recurring_tasks', 'definition-one'), definitionFields())
    await setDoc(doc(database, 'tasks', 'recurring-current'), taskFields({ title: 'Give medicine', recurrence: { frequency: 'custom', interval: 2 }, recurrence_key: 'definition-one', recurring_definition_id: 'definition-one', occurrence_due_date: '2026-08-08' }))
  })
  const jordan = environment.authenticatedContext(jordanId).firestore()
  const complete = () => runTransaction(jordan, async transaction => {
    const currentRef = doc(jordan, 'tasks', 'recurring-current'), current = await transaction.get(currentRef)
    if (current.data().status === 'completed') return
    const definitionRef = doc(jordan, 'recurring_tasks', 'definition-one'), definition = await transaction.get(definitionRef)
    const nextRef = doc(jordan, 'tasks', 'definition-one_2026-08-10_')
    const completedAt = Timestamp.fromDate(new Date('2026-08-08T12:00:00Z'))
    transaction.update(currentRef, { status: 'completed', completed_at: completedAt, completed_by_uid: jordanId, completed_by_name: 'Jordan', updated_at: serverTimestamp() })
    transaction.set(doc(jordan, 'tasks', 'recurring-current', 'activity', 'completion_recurring-current'), { author_uid: jordanId, message: 'Jordan completed this task', created_at: serverTimestamp() })
    transaction.update(definitionRef, { last_completed_at: completedAt, last_completed_occurrence_id: 'recurring-current', next_due_date: '2026-08-10', current_occurrence_id: 'definition-one_2026-08-10_', updated_at: serverTimestamp() })
    transaction.set(nextRef, { ...taskFields({ title: definition.data().title, due_date: '2026-08-10', recurrence: definition.data().schedule, recurrence_key: 'definition-one', recurring_definition_id: 'definition-one', occurrence_due_date: '2026-08-10' }), created_at: serverTimestamp(), updated_at: serverTimestamp() })
  })
  await assertSucceeds(complete())
  await assertSucceeds(complete())
  const next = await assertSucceeds(getDoc(doc(jordan, 'tasks', 'definition-one_2026-08-10_')))
  assert.equal(next.data().due_date, '2026-08-10')
  assert.deepEqual(next.data().assignee_uids, [jordanId])
  const refreshed = environment.authenticatedContext(jordanId).firestore()
  const completed = await assertSucceeds(getDoc(doc(refreshed, 'tasks', 'recurring-current')))
  const definition = await assertSucceeds(getDoc(doc(refreshed, 'recurring_tasks', 'definition-one')))
  assert.equal(completed.data().status, 'completed')
  assert.ok(completed.data().completed_at)
  assert.ok(definition.data().last_completed_at)
})

test('unrelated households cannot read or create Yanely-Jordan data', async () => {
  const outsider = environment.authenticatedContext('outsider-uid').firestore()
  await assertFails(getDoc(doc(outsider, 'tasks', 'assigned-task')))
  await assertFails(setDoc(doc(outsider, 'tasks', 'cross-household'), { ...taskFields({ created_by_uid: 'outsider-uid', created_by_name: 'Outsider' }), created_at: serverTimestamp(), updated_at: serverTimestamp() }))
})

test('profile categories are readable only by their intended members', async () => {
  const yanely = environment.authenticatedContext(yanelyId).firestore()
  const jordan = environment.authenticatedContext(jordanId).firestore()
  await assertSucceeds(getDoc(doc(yanely, 'categories', 'crystal-princess')))
  await assertFails(getDoc(doc(jordan, 'categories', 'crystal-princess')))
  await assertSucceeds(getDoc(doc(jordan, 'categories', 'home')))
  await assertSucceeds(setDoc(doc(jordan, 'categories', 'jordan-custom'), { household_id: household, name: 'Jordan custom', position: 6, archived: false, visible_to_uids: [jordanId], created_at: serverTimestamp(), updated_at: serverTimestamp() }))
  await assertFails(setDoc(doc(jordan, 'categories', 'yanely-only-from-jordan'), { household_id: household, name: 'Not allowed', position: 7, archived: false, visible_to_uids: [yanelyId], created_at: serverTimestamp(), updated_at: serverTimestamp() }))
})
