---
name: negative-devops
description: None of the vue-skills skills should fire on an unrelated task.
tags: [negative]
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Write a GitHub Actions workflow that builds a Docker image, pushes it to GHCR and deploys to a VPS over SSH.
