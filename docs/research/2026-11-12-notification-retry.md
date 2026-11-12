# EXP-137: Busy notification recovery

## Hypothesis

A completed background task can arrive while the gateway still considers the voice path busy, causing the browser's notification request to be rejected. The previous browser handler cleared its in-flight flag without scheduling another attempt or reporting the rejection, so the announcement could remain stuck.

## Change and verification

Both gateway modes now classify a notification rejection as busy or unavailable. The browser retries busy rejections at most three times with 500 ms delays, then reports failure in the conversation log; it reports unavailable or unclassified rejections immediately. An older running gateway may not supply a reason, so its rejection takes the unclassified path. The completed result remains in the conversation.

Eleven targeted tests passed, covering a bounded busy-retry sequence, native bridge rejection classification, session resume and task notification formatting. These use mocked client or bridge events and a local gateway integration; they do not establish that a real browser hears the notification under load. The live gateway must restart to serve the new reason codes.

## Resource constraint

Available RAM was approximately 9.05 GiB at the start of this continuation, below the 10 GiB preflight for the combined spoken coding trial. No real-model trial was launched, and the existing running demo was left in place.
