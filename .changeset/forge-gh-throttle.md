---
"helmor": patch
---

Forge CLI calls (`gh`/`glab`) are now concurrency-capped and idempotent reads (PR/CI status, auth status) are briefly cached and deduped, eliminating the pile-up of GitHub CLI processes during status polling.
