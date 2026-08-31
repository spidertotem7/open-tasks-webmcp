export const TASK_PRIORITIES = ['high', 'medium', 'low']
export const TASK_STATUSES = ['not_started', 'in_progress', 'waiting', 'completed']
export const ACTIVE_TASK_STATUSES = TASK_STATUSES.filter(status => status !== 'completed')
export const WEBMCP_BATCH_LIMIT = 20

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isValidDateString(value) {
  if (!DATE_PATTERN.test(value || '')) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

export function requireValidDate(value, fieldName = 'date') {
  if (value !== null && value !== undefined && value !== '' && !isValidDateString(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD and be a real calendar date.`)
  }
}

export function resolveCategory(value, categories) {
  if (value === undefined) return undefined
  if (value === null || value === '') return ''
  const needle = String(value).trim().toLowerCase()
  const category = categories.find(item => item.id === value || item.name.trim().toLowerCase() === needle)
  if (!category || category.archived) throw new Error(`Category “${value}” is not available.`)
  return category.id
}

export function resolveAssignee(value, user, members) {
  if (value === undefined) return undefined
  const counterpart = members.find(member => member.id !== user.uid)
  if (value === 'me') return user.uid
  if (value === 'other') {
    if (!counterpart) throw new Error('No other active household member is available.')
    return counterpart.id
  }
  if (value === 'household') return 'household'
  const needle = String(value).trim().toLowerCase()
  const member = members.find(item => item.id === value || item.display_name?.trim().toLowerCase() === needle)
  if (!member) throw new Error(`Assignee “${value}” is not an active household member.`)
  return member.id
}

export function taskSummary(task, categories = [], members = []) {
  const category = categories.find(item => item.id === task.category_id)
  const assignees = (task.assignee_uids || []).map(id => members.find(member => member.id === id)?.display_name || id)
  return {
    id: task.id,
    title: task.title,
    description: task.description || '',
    status: task.status,
    priority: task.priority,
    due_date: task.due_date || null,
    category: category ? { id: category.id, name: category.name } : null,
    assignment_type: task.assignment_type || ((task.assignee_uids || []).length > 1 ? 'household' : 'member'),
    assignees,
    created_by: task.created_by_name || task.created_by_uid,
    recurring: Boolean(task.recurring_definition_id),
  }
}

export function filterTasks(tasks, input = {}, options = {}) {
  const { categories = [], selectedTaskIds = [], today } = options
  const selected = new Set(selectedTaskIds)
  const categoryId = input.category === undefined ? undefined : resolveCategory(input.category, categories)
  const ids = input.task_ids ? new Set(input.task_ids) : null
  const search = input.search?.trim().toLowerCase()
  const limit = Math.min(Math.max(Number(input.limit || 50), 1), 100)

  requireValidDate(input.due_before, 'due_before')
  requireValidDate(input.due_after, 'due_after')

  return tasks.filter(task => {
    if (ids && !ids.has(task.id)) return false
    if (input.selected_only && !selected.has(task.id)) return false
    if (input.status === 'active' && task.status === 'completed') return false
    if (input.status && input.status !== 'active' && task.status !== input.status) return false
    if (input.priority && task.priority !== input.priority) return false
    if (categoryId !== undefined && task.category_id !== categoryId) return false
    if (input.overdue && (!task.due_date || task.due_date >= today || task.status === 'completed')) return false
    if (input.due_before && (!task.due_date || task.due_date > input.due_before)) return false
    if (input.due_after && (!task.due_date || task.due_date < input.due_after)) return false
    if (search && !`${task.title} ${task.description || ''}`.toLowerCase().includes(search)) return false
    return true
  }).sort((a, b) => (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31') || a.title.localeCompare(b.title)).slice(0, limit)
}

export function validateTaskPatch(patch, { allowCompleted = false } = {}) {
  const allowed = new Set(['title', 'description', 'due_date', 'priority', 'status', 'category', 'assignee'])
  const supplied = Object.keys(patch).filter(key => key !== 'task_id')
  const unexpected = supplied.filter(key => !allowed.has(key))
  if (unexpected.length) throw new Error(`Unsupported update field: ${unexpected[0]}.`)
  if (!supplied.length) throw new Error('Provide at least one field to update.')
  if ('title' in patch && (!patch.title?.trim() || patch.title.trim().length > 200)) throw new Error('Title must be between 1 and 200 characters.')
  if ('description' in patch && String(patch.description || '').length > 10000) throw new Error('Description cannot exceed 10,000 characters.')
  if ('priority' in patch && !TASK_PRIORITIES.includes(patch.priority)) throw new Error('Priority must be high, medium, or low.')
  if ('status' in patch && (!TASK_STATUSES.includes(patch.status) || (!allowCompleted && patch.status === 'completed'))) throw new Error('Use complete_task to complete a task.')
  if ('due_date' in patch) requireValidDate(patch.due_date, 'due_date')
  return supplied
}

export function validateBatchUpdates(updates, knownTaskIds) {
  if (!Array.isArray(updates) || updates.length === 0) throw new Error('Provide at least one task update.')
  if (updates.length > WEBMCP_BATCH_LIMIT) throw new Error(`A batch can update at most ${WEBMCP_BATCH_LIMIT} tasks.`)
  const seen = new Set()
  for (const update of updates) {
    if (!update?.task_id || typeof update.task_id !== 'string') throw new Error('Every batch item needs a task_id.')
    if (seen.has(update.task_id)) throw new Error(`Task ${update.task_id} appears more than once in the batch.`)
    seen.add(update.task_id)
    if (!knownTaskIds.has(update.task_id)) throw new Error(`Task ${update.task_id} was not found or is not accessible.`)
    validateTaskPatch(update)
  }
  return updates
}

export function buildTaskContext({ view, filters, selectedTaskIds, visibleTasks, categories, members, user, today }) {
  const selected = visibleTasks.filter(task => selectedTaskIds.includes(task.id))
  const category = categories.find(item => item.id === filters.category)
  return {
    current_view: view,
    current_date: today,
    filters: {
      category: category ? { id: category.id, name: category.name } : null,
      priority: filters.priority || null,
      status: filters.status || null,
    },
    signed_in_member: { id: user.uid, name: user.member.display_name },
    household_members: members.map(member => ({ id: member.id, name: member.display_name })),
    visible_category_options: categories.filter(item => !item.archived).map(item => ({ id: item.id, name: item.name })),
    visible_task_count: visibleTasks.length,
    selected_task_ids: selected.map(task => task.id),
    selected_tasks: selected.map(task => taskSummary(task, categories, members)),
  }
}
