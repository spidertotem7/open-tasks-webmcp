import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTaskContext, filterTasks, isValidDateString, resolveAssignee, resolveCategory, validateBatchUpdates, validateTaskPatch, WEBMCP_BATCH_LIMIT } from '../src/lib/webmcpCore.js'

const categories = [{ id: 'personal', name: 'Personal', archived: false }, { id: 'errands', name: 'Errands', archived: false }]
const members = [{ id: 'yanely', display_name: 'Yanely' }, { id: 'jordan', display_name: 'Jordan' }]
const user = { uid: 'yanely', member: { display_name: 'Yanely' } }
const task = overrides => ({ id: 'one', title: 'Record launch trailer', description: 'Draft and record', status: 'not_started', priority: 'high', due_date: '2026-09-02', category_id: 'personal', assignment_type: 'member', assignee_uids: ['yanely'], created_by_uid: 'yanely', created_by_name: 'Yanely', ...overrides })
const tasks = [
  task({}),
  task({ id: 'two', title: 'Buy envelopes', description: '', priority: 'low', due_date: '2026-08-30', category_id: 'errands' }),
  task({ id: 'three', title: 'Finished item', status: 'completed', due_date: '2026-08-29' }),
]

test('date validation accepts real ISO calendar dates and rejects malformed dates', () => {
  assert.equal(isValidDateString('2026-09-04'), true)
  assert.equal(isValidDateString('2026-02-31'), false)
  assert.equal(isValidDateString('09/04/2026'), false)
})

test('list returns all tasks and supports overdue filtering', () => {
  assert.equal(filterTasks(tasks, {}, { categories, today: '2026-08-31' }).length, 3)
  assert.deepEqual(filterTasks(tasks, { overdue: true }, { categories, today: '2026-08-31' }).map(item => item.id), ['two'])
})

test('list supports category, due-date, priority, search, and stable ID filters', () => {
  assert.deepEqual(filterTasks(tasks, { category: 'Personal', due_after: '2026-09-01', priority: 'high' }, { categories, today: '2026-08-31' }).map(item => item.id), ['one'])
  assert.deepEqual(filterTasks(tasks, { search: 'envelopes' }, { categories, today: '2026-08-31' }).map(item => item.id), ['two'])
  assert.deepEqual(filterTasks(tasks, { task_ids: ['three'] }, { categories, today: '2026-08-31' }).map(item => item.id), ['three'])
})

test('list can resolve the current human selection', () => {
  assert.deepEqual(filterTasks(tasks, { selected_only: true }, { categories, selectedTaskIds: ['one', 'two'], today: '2026-08-31' }).map(item => item.id), ['two', 'one'])
})

test('category and household-member references resolve by ID, name, or role', () => {
  assert.equal(resolveCategory('Errands', categories), 'errands')
  assert.equal(resolveCategory('personal', categories), 'personal')
  assert.equal(resolveAssignee('me', user, members), 'yanely')
  assert.equal(resolveAssignee('other', user, members), 'jordan')
  assert.equal(resolveAssignee('Jordan', user, members), 'jordan')
  assert.throws(() => resolveCategory('Missing', categories), /not available/)
  assert.throws(() => resolveAssignee('Missing', user, members), /not an active/)
})

test('update validation accepts one or several supported fields and rejects bad values', () => {
  assert.deepEqual(validateTaskPatch({ task_id: 'one', priority: 'low' }), ['priority'])
  assert.deepEqual(validateTaskPatch({ task_id: 'one', title: 'New title', due_date: null }), ['title', 'due_date'])
  assert.throws(() => validateTaskPatch({ task_id: 'one' }), /at least one/)
  assert.throws(() => validateTaskPatch({ task_id: 'one', priority: 'urgent' }), /Priority/)
  assert.throws(() => validateTaskPatch({ task_id: 'one', status: 'completed' }), /complete_task/)
})

test('batch validation rejects nonexistent IDs, duplicates, and unreasonable size before writes', () => {
  const ids = new Set(tasks.map(item => item.id))
  assert.equal(validateBatchUpdates([{ task_id: 'one', due_date: '2026-09-04' }, { task_id: 'two', priority: 'high' }], ids).length, 2)
  assert.throws(() => validateBatchUpdates([{ task_id: 'missing', priority: 'low' }], ids), /not found/)
  assert.throws(() => validateBatchUpdates([{ task_id: 'one', priority: 'low' }, { task_id: 'one', priority: 'high' }], ids), /more than once/)
  assert.throws(() => validateBatchUpdates(Array.from({ length: WEBMCP_BATCH_LIMIT + 1 }, (_, index) => ({ task_id: `id-${index}`, priority: 'low' })), new Set()), /at most/)
})

test('page context reports current view, filters, and selected task IDs', () => {
  const context = buildTaskContext({ view: 'my', filters: { category: 'personal', priority: 'high', status: '' }, selectedTaskIds: ['one'], visibleTasks: tasks, categories, members, user, today: '2026-08-31' })
  assert.equal(context.current_view, 'my')
  assert.deepEqual(context.filters.category, { id: 'personal', name: 'Personal' })
  assert.deepEqual(context.selected_task_ids, ['one'])
  assert.equal(context.selected_tasks[0].title, 'Record launch trailer')
})
