import { ACTIVE_TASK_STATUSES, TASK_PRIORITIES, TASK_STATUSES, WEBMCP_BATCH_LIMIT } from './webmcpCore'

const dateSchema = { type: ['string', 'null'], description: 'Calendar date in YYYY-MM-DD format, or null to remove the due date.' }
const assigneeSchema = { type: 'string', description: 'Use "me", "other", "household", an active member ID, or an exact active member name.' }
const categorySchema = { type: ['string', 'null'], description: 'Visible category ID or exact category name. Use null to remove the category.' }

function result(message, data = {}) {
  return { content: [{ type: 'text', text: message }], structuredContent: { message, ...data } }
}

function mutationSchema(properties) {
  return {
    type: 'object',
    properties,
    additionalProperties: false,
  }
}

export const webmcpToolDefinitions = [
  {
    name: 'get_task_context',
    title: 'Get task page context',
    description: 'Use before interpreting words such as “these”, “here”, or “this list”. Returns the signed-in member, current task view and filters, visible category/member choices, and stable IDs for tasks the human selected in the UI. This tool does not change data.',
    annotations: { readOnlyHint: true },
    inputSchema: mutationSchema({}),
  },
  {
    name: 'list_tasks',
    title: 'List tasks',
    description: 'Retrieve concise task records that the signed-in household member is authorized to access. Use returned stable task IDs for all mutations; never guess an ID from a title. Date bounds are inclusive. “overdue” means incomplete with a due date before the app’s current calendar date.',
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
    description: 'Create one task in the current workspace. The title is the only required field. Defaults: medium priority, Not Started, assigned to the signed-in member, no due date, and the currently filtered category when applicable. The visible UI updates immediately through the app’s normal state synchronization.',
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
    description: 'Update exactly one accessible task by stable task ID. Only explicitly supplied fields change. Use complete_task rather than setting status to completed. Recurrence schedules are intentionally outside this tool for reliability.',
    inputSchema: {
      ...mutationSchema({
        task_id: { type: 'string', minLength: 1 },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string', maxLength: 10000 },
        due_date: dateSchema,
        priority: { type: 'string', enum: TASK_PRIORITIES },
        status: { type: 'string', enum: ACTIVE_TASK_STATUSES },
        category: categorySchema,
        assignee: assigneeSchema,
      }),
      required: ['task_id'],
    },
  },
  {
    name: 'complete_task',
    title: 'Complete task',
    description: 'Reliably complete one accessible task by stable ID. Defaults the completion date and completer to today and the signed-in member. Completing a recurring occurrence uses the app’s idempotent transaction and generates exactly one next occurrence.',
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
    description: `Update 1–${WEBMCP_BATCH_LIMIT} known accessible tasks in one deliberate request. Every ID and patch is validated before writes begin. Use this for selections and multi-task rescheduling. Completion is excluded; call complete_task for completion history and recurrence safety.`,
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
              title: { type: 'string', minLength: 1, maxLength: 200 },
              description: { type: 'string', maxLength: 10000 },
              due_date: dateSchema,
              priority: { type: 'string', enum: TASK_PRIORITIES },
              status: { type: 'string', enum: ACTIVE_TASK_STATUSES },
              category: categorySchema,
              assignee: assigneeSchema,
            },
          },
        },
      },
    },
  },
]

export async function registerTaskTools({ getContext, listTasks, createTask, updateTask, completeTask, batchUpdateTasks, onDebug }) {
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
        return output?.content ? output : result(output.message || `${definition.title} succeeded.`, output)
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

export function toolResult(message, data) {
  return result(message, data)
}
