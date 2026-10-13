---
name: vue-forms-validation
description: The vue-forms-validation skill should fire and shape the answer.
tags: [skill, vue-forms-validation]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Write a Vue 3 registration form with vee-validate and a schema library: email, password, confirm password, a dynamic list of emergency contacts (phone numbers, at least one) and a username that must be checked against /api/username-free. Error messages must be translated with vue-i18n and the form must not submit twice. Show the script setup code and explain the decisions.
