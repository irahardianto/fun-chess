# Research Log: Chess Academy Curriculum & Pedagogical Audit

**Date:** 2026-09-07
**Researcher:** Scout (Agent ID: `2d50dd3f-5c12-4a14-8d16-92b31dca8e44`)
**Scope:** `apps/client/src/features/scenarios/` (43 Scenarios, 99 Tutorial Steps)
**Full Audit Deliverable:** `file:///home/irahardianto/works/projects/fun-chess/.agentwork/academy_curriculum_audit.md`

## Topics Investigated
1. **Scenario-by-Scenario Inventory & Setup Verification:** 43 scenarios / 99 steps in `apps/client/src/features/scenarios/data/`.
2. **FEN Validity & Chess.js Engine Verification:**
   - Identified 4 illegal starting positions where opponent King is in check on player's turn (`rook-lines`, `desperado-escape`, `balestra-blackburne`, `kill-box-railroad`).
   - Identified 3 fundamental lessons teaching blunders (`knight-jumps`, `bishop-diagonals`, `queen-power`) where the target piece is actually defended by Black.
   - Identified 7 scenarios with 9 steps where alternative checkmates in 1 exist but are rejected by the validator.
   - Identified factual chess error in `royal-fork` (claiming Knight on c7 attacks Queen on d8).
3. **Curriculum Benchmarking against International Standards:**
   - Benchmarked against Dutch Chess Steps Method (*Stappenmethode*), FIDE Trainers' Syllabus, ChessKid, and Lichess Learn.
   - Discovered 7 critical curriculum gaps: Stalemate vs Checkmate, Piece Values, CPR (3 ways to escape check), Castling Restrictions, Board Coordinates/Geometry, Opening Principles/Center Control, and King+Pawn Endgames.
4. **Curriculum Sequence & Difficulty Pacing:**
   - Identified 5 major sequence inversions (Traps before Tactics, Tactics before Checkmates, Queen/Rook endgames delayed until Section 8, and Lucena/Philidor 1600+ Elo difficulty cliff).
   - Incoherent age/difficulty metadata (Pins labeled 11-15, Greek Gift labeled 7-10).
5. **Comprehensibility, Tone & UX Writing:**
   - Reviewed instructional copy, hints, success text, and opponent dialogue.
   - Recommended replacing scary terms ("Kiss of Death", "Kill Box") with kid-friendly naming ("Queen's Hug", "Corner Box").
   - Identified dialogue bugs (e.g. Bishop capturing on d7 while dialogue claims "I must take with my Queen!").

## Sources & Tools
- `apps/client/src/features/scenarios/data/index.ts`
- `apps/client/src/features/scenarios/engine/scenario_validator.ts`
- `apps/client/src/features/scenarios/composables/useScenarioRunner.ts`
- Node v26 + `chess.js` automated analysis scripts
- Dutch Steps Method (*Stappenmethode*), FIDE Trainers' Syllabus, ChessKid, Lichess Learn.
