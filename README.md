# Tasks

A private shared household task manager for Yanely and Jordan. The app uses Firebase Authentication and Firestore for real-time task updates, and exposes page-scoped WebMCP tools so ChatGPT can work with the signed-in task list directly.

[Open the app](https://yanely-jordan-task-hub.vercel.app)

## Use with ChatGPT

1. Open the app in ChatGPT's WebMCP-capable in-app browser.
2. Sign in with an approved household account. Authentication persists in that browser until you log out.
3. Keep the app page open and ask ChatGPT to work with your tasks, for example:
   - “Add ‘Order dog food’ for Friday and make it high priority.”
   - “What tasks are overdue?”
   - Select several cards and ask: “Move these to next Monday.”

The tools are available only after an approved member is authenticated. Add `?webmcpDebug=1` to the app URL when troubleshooting; the small diagnostic shows whether WebMCP is available and how many tools registered.

WebMCP is page-scoped. It does not make the task database available to an unrelated ChatGPT conversation while the app is closed. That broader experience would require a separately deployed, authenticated remote MCP connector.

## WebMCP tools

| Tool | Purpose |
| --- | --- |
| `get_task_context` | Read the current view, filters, member choices, and selected stable task IDs. |
| `list_tasks` | Retrieve accessible tasks using status, date, priority, category, text, ID, or selection filters. |
| `create_task` | Create a validated task through the existing task model. |
| `update_task` | Update explicitly supplied fields on one accessible task. |
| `complete_task` | Complete a task through the existing history and recurring-task behavior. |
| `batch_update_tasks` | Update as many as 20 validated task IDs. |

The adapter is in `src/lib/webmcp.js`; validation and structured filtering are in `src/lib/webmcpCore.js`. Tool handlers reuse the same task operations as the visual interface, so Firestore listeners reflect changes immediately.

## Access and safety

- Firebase Authentication uses browser-local persistence.
- Only active `members/{uid}` records can enter the workspace.
- Firestore rules isolate household data and restrict task access to creators and assignees.
- WebMCP tools register only for an authenticated approved member.
- Unknown IDs, invalid dates and enums, empty updates, duplicate batch IDs, and batches over 20 tasks are rejected.
- Deletion is not exposed as an agent tool.

## Local setup

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Populate the `VITE_FIREBASE_*` variables, create approved `members/{uid}` records, and deploy the included Firestore rules and indexes.

```powershell
npm run lint
npm test
npm run test:e2e
npm run test:rules
npm run build
```

## Stack

React 19, Vite 8, Firebase Authentication, Firestore real-time listeners, WebMCP, and Vercel.

MIT licensed.
