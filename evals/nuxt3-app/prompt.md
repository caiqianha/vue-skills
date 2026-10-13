---
name: nuxt3-app
description: The nuxt3-app skill should fire and shape the answer.
tags: [skill, nuxt3-app]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

I have a Nuxt 4 app (app/ directory layout). On /orders I call useAsyncData('list', () => $fetch('/api/orders', { query: query.value })) and on /invoices the same with a different URL. Two problems: the invoices page sometimes shows orders, and in the network tab the orders request fires twice on first load. The HTML of /orders is also 2.5 MB. Explain what is wrong and show the corrected code for the orders page.
