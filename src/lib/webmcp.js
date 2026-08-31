import { ACTIVE_TASK_STATUSES, TASK_PRIORITIES, TASK_STATUSES, WEBMCP_BATCH_LIMIT } from './webmcpCore'

const dateSchema = { type: ['string', 'null'], description: 'Calendar date in YYYY-MM-DD format, or null to remove the due date.' }
const assigneeSchema = { type: 'string', description: 'Use "me", "other", "household", an active member ID, or an exact active member name.' }
const categorySchema = { type: ['string', 'null'], description: 'Visible category ID or exact category name. Use null to remove the category.' }

export function toolResult(message, data = {}) {
  return { content: [{ type: 'text', text: message }], structuredContent: { message, ...data } }
}

function mutationSchema(properties) {
  return {
    type: 'object',
    properties,
    additionalProperties: false,
  }
}

const taskPatchProperties = {
  title: { type: 'string', minLength: 1, maxLength: 200 },
  description: { type: 'string', maxLength: 10000 },
  due_date: dateSchema,
  priority: { type: 'string', enum: TASK_PRIORITIES },
  status: { type: 'string', enum: ACTIVE_TASK_STATUSES },
  category: categorySchema,
  assignee: assigneeSchema,
}

export const webmcpToolDefinitions = [
  {
    name: 'get_task_context',
    title: 'Get task page context',
    description: 'Read the current view, filters, member choices, and selected task IDs. Use before interpreting references such as “these tasks” or “this list”.',
    annotations: { readOnlyHint: true },
    inputSchema: mutationSchema({}),
  },
  {
    name: 'list_tasks',
    title: 'List tasks',
    description: 'List accessible tasks using structured filters. Use returned stable IDs for mutations; date bounds are inclusive and overdue excludes completed tasks.',
    annotations: { readOnlyHint: true },
    inputSchema: mutationSchema({
      status: { type: 'string', enum: ['active', ...TASK_STATUSES] },
      category: categorySchema,
      priority: { type: 'string', enum: TASK_PRIORITIES },
      due_before: { type: 'string', description: 'Inclusive YYYY-MM-DD upper due-date bound.' },
      due_after: { type: 'string', description: 'Inclusive YYYY-MM-DD lower due-date bound.' },
      overdue: { type: 'boolean' },
      search: { type: 'string', maxLength: 200, description: 'Case-insensitive title and notes search.' },
      task_ids: { type: 'array', maxItems: 50, uniqueItems: true, items: { type: 'string' } },
      selected_only: { type: 'boolean', description: 'When true, return only tasks currently selected by the human in the UI.' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
    }),
  },
  {
    name: 'create_task',
    title: 'Create task',
    description: 'Create one task. Title is required; priority, status, assignee, due date, and category use documented defaults when omitted.',
    inputSchema: {
      ...mutationSchema({
        title: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string', maxLength: 10000 },
        due_date: dateSchema,
        priority: { type: 'string', enum: TASK_PRIORITIES, default: 'medium' },
        status: { type: 'string', enum: ACTIVE_TASK_STATUSES, default: 'not_started' },
        category: categorySchema,
        assignee: assigneeSchema,
      }),
      required: ['title'],
    },
  },
  {
    name: 'update_task',
    title: 'Update task',
    description: 'Update explicitly supplied fields on one accessible task identified by stable ID. Use complete_task for completion.',
    inputSchema: {
      ...mutationSchema({
        task_id: { type: 'string', minLength: 1 },
        ...taskPatchProperties,
      }),
      required: ['task_id'],
    },
  },
  {
    name: 'complete_task',
    title: 'Complete task',
    description: 'Complete one accessible task by stable ID. Date and completer default to today and the current member; recurring completion safely creates the next occurrence.',
    inputSchema: {
      ...mutationSchema({
        task_id: { type: 'string', minLength: 1 },
        completed_on: { type: 'string', description: 'YYYY-MM-DD completion date. Defaults to the app’s current date and cannot be in the future.' },
        completed_by: assigneeSchema,
      }),
      required: ['task_id'],
    },
  },
  {
    name: 'batch_update_tasks',
    title: 'Batch update tasks',
    description: `Update 1–${WEBMCP_BATCH_LIMIT} accessible tasks by stable ID. All IDs and patches are validated first; use complete_task for completion.`,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['updates'],
      properties: {
        updates: {
          type: 'array',
          minItems: 1,
          maxItems: WEBMCP_BATCH_LIMIT,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['task_id'],
            properties: {
              task_id: { type: 'string', minLength: 1 },
              ...taskPatchProperties,
            },
          },
        },
      },
    },
  },
]

export async function registerTaskTools({ getContext, listTasks, createTask, updateTask, completeTask, batchUpdateTasks, onDebug }) {
  // navigator.modelContext supports older challenge browser builds; new browsers use document.modelContext.
  const modelContext = document.modelContext || navigator.modelContext
  if (!modelContext?.registerTool) {
    onDebug?.({ available: false, registered: [], error: 'WebMCP is not available in this browser.' })
    return () => {}
  }

  const controller = new AbortController()
  const handlers = { get_task_context: getContext, list_tasks: listTasks, create_task: createTask, update_task: updateTask, complete_task: completeTask, batch_update_tasks: batchUpdateTasks }
  const registered = []

  for (const definition of webmcpToolDefinitions) {
    const execute = async input => {
      const startedAt = new Date().toISOString()
      try {
        const output = await handlers[definition.name](input || {})
        onDebug?.({ available: true, registered: [...registered], lastInvocation: { tool: definition.name, startedAt, ok: true, output } })
        return output?.content ? output : toolResult(output.message || `${definition.title} succeeded.`, output)
      } catch (error) {
        console.error(`[task-hub:webmcp] ${definition.name} failed`, error)
        onDebug?.({ available: true, registered: [...registered], lastInvocation: { tool: definition.name, startedAt, ok: false, error: error.message } })
        throw new Error(error.message || `${definition.title} failed.`)
      }
    }
    await modelContext.registerTool({ ...definition, execute }, { signal: controller.signal })
    registered.push(definition.name)
    onDebug?.({ available: true, registered: [...registered] })
  }

  return () => controller.abort()
}
