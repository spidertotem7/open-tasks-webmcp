# Devpost Submission Copy

## Project name

Open Tasks

## One-line pitch

An existing task manager transformed into an agent-native shared workspace where humans work visually and agents act structurally on the same live state.

## Short description

Open Tasks bridges the planning people already do with ChatGPT and the task system they already use. Through WebMCP, an agent can retrieve, create, update, complete, and safely batch-edit real tasks while understanding the current page and the cards the human selected. Every change appears immediately in the existing app.

## Full project description

Open Tasks turns an existing household task manager into an agent-native shared workspace where the human can work visually and the agent can act structurally on the same live application state.

Instead of copying action items out of a conversation, a user can ask ChatGPT to create a high-priority task, summarize what is overdue, or reschedule several selected cards. WebMCP gives the agent validated tools, stable identifiers, current filters, and selection-aware page context. The existing React/Firebase operations remain the source of truth, and changes appear immediately in the UI.

The key interaction is mixed-initiative collaboration: a person selects the exact tasks that matter visually, then uses natural language for the change. The agent understands “these” from structured page context and performs the corresponding batch operation without DOM guessing.

## Inspiration / problem

Tasks constantly emerge during brainstorming, research, writing, and planning with AI. Capturing them traditionally means leaving the conversation, opening a separate app, navigating forms, and manually transferring details. Visual browser automation can imitate those clicks, but it is fragile and ambiguous—especially when several tasks have similar names or need a coordinated update.

## What it does

- Creates tasks with due dates, priorities, categories, and assignees.
- Retrieves exact task state using structured filters.
- Updates or completes known tasks using stable IDs.
- Lets a human select cards and exposes that selection as agent context.
- Safely batch-updates up to 20 validated tasks.
- Reflects agent actions immediately in the human-facing interface.
- Provides an isolated, seeded, no-login workspace for judges.

## How WebMCP is used

Open Tasks registers six tools with `document.modelContext.registerTool(tool, { signal })`: `get_task_context`, `list_tasks`, `create_task`, `update_task`, `complete_task`, and `batch_update_tasks`. Strict JSON schemas map to existing application mutations. Tool responses include concise summaries and stable task IDs so the agent can communicate results confidently.

WebMCP exposes application semantics that are unreliable to infer from the DOM: exact record identity, authorized task visibility, filter meaning, selected IDs, validation rules, and safe batch boundaries.

## Human + agent experience

The human uses the interface for scanning, filtering, and pointing. The agent uses language and structured tools for understanding intent, reasoning across tasks, and repetitive changes. Both collaborate in the same workspace, and the interface remains visibly synchronized.

## How it was built

The existing application uses React 19, Vite 8, Firebase Authentication, Firestore real-time listeners, and Vercel. A dedicated WebMCP adapter registers six tools while framework-independent helpers validate inputs and filter task data. Authenticated operations reuse existing Firebase functions. The judge demo uses isolated browser-local storage but the same UI and WebMCP interface.

## Challenges encountered

The central challenge was maintaining one source of truth for human and agent actions. Selection-aware context had to stay current without stale registrations; mutations needed useful summaries without leaking private Firebase details; and judge access had to be realistic without exposing household data. Batch changes also required complete pre-validation and a conservative limit.

## Accomplishments

- Six production WebMCP tools mapped to existing application behavior.
- Selection-aware page context and reliable multi-task updates.
- Immediate visible synchronization after tool calls.
- A safe no-login judge experience isolated from private data.
- Automated WebMCP, visibility, recurrence, and Firestore security tests.
- A public repository, live deployment, and concise judge workflow.

## What we learned

The strongest agent-native experiences do not replace the interface. They let people and agents share context while each uses the interaction mode best suited to the moment. Stable identifiers, narrow schemas, page awareness, and visible feedback matter more than a large tool count.

## What's next

After the challenge, the same approach could support richer selection semantics and reversible operation previews while preserving the narrow, user-controlled tool boundary.

## Live demo URL

https://yanely-jordan-task-hub.vercel.app

## GitHub repository URL

https://github.com/spidertotem7/open-tasks-webmcp

## Demo video URL

**PLACEHOLDER — add the final public YouTube URL before submission.**
