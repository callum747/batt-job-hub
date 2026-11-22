---
name: App build scope
description: Keep the root app's build tools scoped to its own source.
---

Scope Tailwind discovery and TypeScript checking to the app source rather than recursively scanning the whole project.

**Why:** The app shares its project root with unrelated starter packages and linked tooling resources, which must not become build inputs.

**How to apply:** Preserve explicit source boundaries when changing build configuration or adding source directories.
