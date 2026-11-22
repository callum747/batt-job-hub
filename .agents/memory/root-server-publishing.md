---
name: Root server publishing
description: Publish Batt Job Hub as a normal root Next.js server, not a multi-artifact app.
---

Keep Batt Job Hub publishing as a root Node web server rather than re-enabling starter artifact manifests.

**Why:** The user explicitly requested normal Node/Autoscale publishing. Active starter manifests caused the publishing service to select artifact mode and start the unrelated API server instead of the root Next.js app.

**How to apply:** Preserve disabled starter manifests when adjusting Replit setup; use root app commands and port 3000. Do not infer the production address from development environment variables.
