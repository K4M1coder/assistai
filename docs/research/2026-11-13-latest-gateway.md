# EXP-172: Latest cascade gateway on shared services

The latest gateway was started on port 18093 using the existing Vosk, Pocket TTS, llama.cpp and OpenCode services; no model was started or replaced. Its startup sample reported 16,260,444,160 bytes dedicated GPU use, 265,338,880 bytes shared GPU use and 9,809,518,592 bytes available system RAM. The sample is advisory and is not a hard limit or proof against paging or spill.

A local WebSocket text turn returned a French answer and 247,680 bytes of speech audio. The gateway advertised cascade mode, speech review and task cancellation. This did not launch an agent task, open a physical microphone or test audible quality. Port 18093 uses a new volatile session; the older gateways remain separate to avoid discarding their existing in-memory histories. Stopping a gateway still discards its volatile history.
