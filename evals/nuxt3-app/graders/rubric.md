---
type: llm
weight: 2
---

Score the final answer against these criteria. A good answer satisfies all of them; each missed criterion lowers the score proportionally.

- Says the two pages share data because of a colliding useAsyncData/useFetch key and recommends a key built from the resource and its params
- Keeps useAsyncData or useFetch in setup so the request runs once per request (server result reused on the client), and reserves bare $fetch for event handlers
- Recommends pick or transform to keep the serialised payload small
- Mentions useRequestFetch or useFetch (not bare $fetch) for cookies to reach internal /api routes during SSR
- Uses status instead of the deprecated pending, and sets a default value
- Warns against module-level reactive state (useState or Pinia instead)
