# AI Collaboration – Algorithm Design Notes

## Goal
Design a deterministic production schedule reflow algorithm that:
- Respects work center capacity (no overlaps)
- Handles multi-parent dependencies
- Pauses outside shift hours
- Skips maintenance windows
- Keeps maintenance work orders immovable

---

## Key Design Decisions

### 1. Forward-only scheduling
We do not pull work orders earlier than their original start.
Reason: In real ERP systems, reflow typically cascades forward after disruption.

---

### 2. Topological Sorting
We use Kahn’s algorithm for:
- Dependency ordering
- Cycle detection

If a cycle is detected → throw error.

---

### 3. Timeline Per Work Center
Each work center maintains:
- Fixed blocks (maintenance windows + maintenance work orders)
- Scheduled intervals

This guarantees:
- No overlaps
- Deterministic conflict resolution

---

### 4. Working-Minute Calculation
We:
- Align to next shift window
- Consume working minutes
- Skip maintenance blocks
- Resume next shift if needed

All time math is shift-aware.

---

## Known Limitations (@upgrade)
- No priority-based optimization
- No backward scheduling
- No resource balancing heuristic
- No utilization metrics