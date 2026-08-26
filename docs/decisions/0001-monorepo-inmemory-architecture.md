---
$schema: "https://raw.githubusercontent.com/irahardianto/awesome-agv/main/.agents/skills/structured-spec/spec-schema.json"
spec_id: "ADR-0001-MONOREPO-INMEMORY-ARCHITECTURE-V1"
title: "Monorepo Workspace & In-Memory State Architecture"
doc_type: "adr"
status: "accepted"
version: "1.0.0"
owners: ["tech-lead"]
created: "2026-08-24"
modified: "2026-08-24"
---

<!-- decision
  id: ADR-0001
  title: Monorepo Workspace & In-Memory State Architecture
  status: accepted
  context: Fun Chess requires local zero-install LAN play with real-time WebSockets, high testability, and isolated layers without external database dependencies.
  alternatives: ["Separate repos with sqlite", "Monorepo with npm workspaces and in-memory store"]
  rationale: npm workspaces with shared contracts package provides type-safe boundaries between client and server while in-memory store guarantees zero external dependencies for local LAN gaming.
  consequences: In-memory state is ephemeral, which aligns with short-lived LAN gaming sessions.
-->

## Context
Fun Chess is designed for kids and families playing over local Wi-Fi. It requires zero configuration, instant startup, authoritative chess game state synchronization, and strict separation between domain logic and I/O.

## Decision
1. **Monorepo Layout**: Standard npm workspaces containing `shared` (pure contracts), `apps/server` (Node.js + Socket.io + static host), and `apps/client` (Vue 3 + Vite).
2. **I/O Isolation**: In-memory room storage behind the `RoomStore` interface with production (`InMemoryRoomStore`) and test double (`MockRoomStore`) implementations.
3. **Structured Observability**: 3-point logging (`start`, `success`, `fail`) with correlation IDs on all socket events via `wrapSocketHandler`.

## Status
Accepted.
