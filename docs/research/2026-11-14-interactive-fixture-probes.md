# EXP-187: Operator-attended coding fixture probes

The approval-flow changes caused both coding probes to decline every proposed task, preventing a real end-to-end fixture run. The probes now display the original request and proposed task in an interactive terminal and send approval only for an explicit `y`. If input is not a terminal, malformed, closed, or declined, they decline and stop. This is an operator decision, not automatic semantic validation; the operator must check the workspace, filename, operation and scope. The transcript and proposed task may be inaccurate.

The guarded PowerShell runner accepts `-InteractiveApproval`, which starts the probe attached to its terminal while the parent continues resource sampling. Agent and gateway logs and resource samples are retained as before; interactive probe output goes to the terminal rather than redirected probe log files. Without that switch the hidden probe has no interactive terminal and declines. Run only against the disposable fixture created by the documented setup; OpenCode permissions are not an OS sandbox, and the workspace check does not prove that an independently configured gateway uses that workspace.

For a prepared disposable fixture and free trial ports, an operator-attended run can be started from a Windows terminal with:

```powershell
.\scripts\run-voice-agent-edit-trial.ps1 -Workspace '.cache\YOUR-DISPOSABLE-FIXTURE' -AgentPort 18110 -GatewayPort 18111 -SpokenInput -Notification -InteractiveApproval
```

The resource preflight and watchdog still apply. Do not approve a proposed task with a wrong filename, operation, negation or scope.

The Node and Python mock tests passed, including a non-terminal decline and a simulated explicit approval. Separate PowerShell `Start-Process -NoNewWindow` pseudoterminal checks confirmed that the Node prompt accepted `y` and the Python prompt declined `n`. Runner syntax was checked. No live agent task, physical microphone or new GPU model was used, and full end-to-end execution remains unverified.
