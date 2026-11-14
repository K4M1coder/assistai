# EXP-201: Redact credentials from service discovery addresses

Service discovery displayed configured endpoint addresses. Although it did not return a provider's separate API key field, URL userinfo or query parameters could carry credentials and were previously returned in the response. The displayed endpoint now omits userinfo, query strings and fragments for controller, agent, ASR, TTS and harness addresses. This affects reporting only; it does not change authentication or how backend connections are made.

Three service-status tests passed, including synthetic credentials in URLs. The checks do not prove arbitrary provider metadata or URL path components contain no secrets. The gateway remains unauthenticated on loopback. Existing gateway processes must restart to load the change; no running user session was modified.
