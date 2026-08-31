# Open Tasks — Project Description

Open Tasks turns an existing task manager into an agent-native shared workspace where the human can work visually and the agent can act structurally on the same live application state.

Tasks are often discovered while people are already planning, writing, or researching with ChatGPT. Moving those decisions into a task manager normally interrupts the conversation and requires manual form entry. Generic browser automation is also a poor substitute: it guesses at DOM structure and becomes risky when several similar tasks need exact changes.

WebMCP makes the task manager a first-class tool environment. Open Tasks exposes six validated capabilities for reading page context, listing, creating, updating, completing, and batch-updating tasks. Stable IDs prevent title ambiguity. Page-aware context includes the active view, filters, and cards the human selected, so “move these to Friday” refers to the exact visible selection rather than a guess.

The result is genuine human-agent collaboration. A person points visually by selecting tasks; the agent interprets intent, retrieves precise state, and makes repetitive changes; the existing React interface updates immediately. Neither participant has to abandon the interaction style best suited to the moment.

The implementation uses the current `document.modelContext.registerTool(tool, { signal })` API and maps strict JSON schemas to existing React/Firebase mutations. Firebase listeners synchronize authenticated household data in real time. An isolated no-login workspace gives judges realistic seeded tasks through the same WebMCP tools without exposing private data. Mutations validate IDs, dates, enums, empty patches, and batch size; deletion is intentionally not exposed.
