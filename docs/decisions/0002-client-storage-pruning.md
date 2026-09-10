---
$schema: "https://raw.githubusercontent.com/irahardianto/awesome-agv/main/.agents/skills/structured-spec/spec-schema.json"
spec_id: "ADR-0002-CLIENT-STORAGE-PRUNING-V1"
title: "Client-Side 30-Day Opportunistic Storage Key Pruning Policy"
doc_type: "adr"
status: "accepted"
version: "1.0.0"
owners: ["tech-lead", "frontend-engineer"]
created: "2026-09-10"
modified: "2026-09-10"
---

<!-- decision
  id: ADR-0002
  title: Client-Side 30-Day Opportunistic Storage Key Pruning Policy
  status: accepted
  context: Browser LocalStorage has quota limits (typically 5MB) and can accumulate stale ephemeral keys (session tokens, room reconnect payloads, sync diff hashes, temporary snooze timestamps) across dozens of gaming sessions. Without a defined eviction policy, unbounded growth risks QuotaExceededError and stale session bleed.
  alternatives: [
    "Unmanaged storage without eviction (rely on user manual browser data clear)",
    "IndexedDB migration for all storage needs",
    "30-day opportunistic storage key pruning on app boot with persistent key whitelisting"
  ]
  rationale: A 30-day opportunistic pruning strategy keeps localStorage lightweight, deterministic, and within quota bounds without introducing heavy IndexedDB complexity for lightweight key-value metadata.
  consequences: Ephemeral session entries older than 30 days are automatically pruned during app initialization. Persistent user assets (theme preferences, avatar choices, validated scenario progress) are whitelisted and never evicted.
-->

## Context

Fun Chess runs as a progressive web application (PWA) with offline-first capabilities. The client application relies on `safeLocalStorage` for:
1. **Persistent User Settings**: Theme selection (`fun_chess_theme`), player avatar (`fun_chess_player_avatar`), and scenario achievement progress (`fun_chess_scenario_progress_v1`).
2. **Ephemeral Session State**: Reconnect session tokens (`fun_chess_reconnect_session`), PWA installation prompt snooze timestamps (`pwa_install_dismissed_time`), progress sync verification hashes, and temporary multiplayer room codes.

Without an automated pruning lifecycle:
- Stale reconnect session tokens and dismissal timers accumulate across browser updates and gameplay iterations.
- LocalStorage quota (5MB limit on WebKit/Blink) risks starvation or unexpected `QuotaExceededError` on constrained mobile devices.
- Stale reconnect attempts against expired or deleted room instances cause unnecessary network round-trips.

## Decision

We adopt a **30-day opportunistic client storage key pruning policy** (ENH-014) governed by the following architectural rules:

### 1. Key Classification & Whitelist Protection
Storage keys are partitioned into two categories:
- **Protected Canonical Keys (Never Pruned)**:
  - `fun_chess_theme`: User interface appearance preference.
  - `fun_chess_player_avatar`: Player-selected identity mascot/emoji.
  - `fun_chess_scenario_progress_v1`: Academy learning and puzzle completion stars.
  - `fun_chess_puzzle_rating`: Adaptive puzzle ladder rating and statistics.
- **Ephemeral & Cache Keys (30-Day TTL Subject to Pruning)**:
  - Reconnect session state and room authorization tokens.
  - Installation banner dismissal and snooze markers.
  - Progress sync diff snapshots and validation staging keys.
  - Transient telemetry and debug log queues.

### 2. Opportunistic Execution Model
- **Non-Blocking Execution**: Pruning runs asynchronously during post-boot initialization or idle time (`requestIdleCallback` when supported, or background task), never blocking critical path first-contentful paint (FCP).
- **Time Window**: Any ephemeral key with an associated timestamp older than 30 days ($30 \times 24 \times 60 \times 60 \times 1000\text{ ms} = 2,592,000,000\text{ ms}$) is safely evicted.
- **Graceful Degradation**: Pruning errors (e.g., storage access denied in restrictive private browsing modes) fail safely without interrupting game flow.

### 3. I/O Isolation & Testability
- Storage inspection and pruning logic is encapsulated behind the `KeyValueStorage` interface.
- Pruning routines receive an explicit `IClock` abstraction to guarantee deterministic verification in unit and integration test suites without flaky timers.

## Status

Accepted.
