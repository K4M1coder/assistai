# EXP-197: Preserve queued notifications across progress events

The gateway looked up a completed task for speech in the latest 20 task events. This bounded context is appropriate for model prompts, but progress and monitoring events can push an earlier completion out of that window while a notification is queued. The result would be reported unavailable even though it was still in the same session's database.

Both native and cascade notification paths now look up the requested completed task directly by session and task ID. This does not automatically replay historical results, and access remains scoped to the current session. The query searches retained history; it does not guarantee retention if the database is cleared, or prove the result is correct.

In a mock-service integration, a completion was recorded, 21 subsequent progress events were inserted, and the resumed session successfully requested its notification. The same test verified that another session could not request it. A separate native gateway integration passed. No real audio device or model was used; the real-model controller preflight was refused because demo connections were active. Existing gateway processes must be restarted to load this change.
