# EXP-154: Optional transcript review before delegation

## Hypothesis and design

In EXP-144, the recognizer lost a filename and operation distinction, and the controller delegated the opposite task. An optional review step can let a user correct the transcript before it reaches the cascade controller. The gateway holds the recognized text's connection-scoped review ID and any attached image; it sends neither a model nor vision request until a matching edited submission arrives. The browser places the transcript in the text field and pauses new capture while review is pending. The feature is off by default and unavailable in the native speech bridge.

## Verification and limitations

Seven targeted tests passed. A mock gateway integration verified that a spoken image and transcript generated no vision request before review, rejected an incorrect review ID without dispatch, then sent the corrected text and original image to the vision service. A mock browser test checked submission of edited text, and the native gateway capability test confirmed that the option is unavailable there. No physical microphone, real model, user review interaction or performance test was run. The running port 18091 gateway predates this change.

Review does not guarantee correct interpretation, prevent harmful actions, identify users or enforce permissions. It changes the user's workflow and is optional. Disabling it or disconnecting drops the pending server-side turn; a new image cannot be added to an already pending review. Existing unsandboxed agent permissions and memory limitations are unchanged. Live browser testing and an ASR comparison remain necessary.
