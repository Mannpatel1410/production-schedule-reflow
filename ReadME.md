# Production Schedule Reflow

## Overview

This repository contains a production schedule reflow system for a manufacturing environment.

When disruptions occur (delays, maintenance events, dependency cascades), the scheduler recomputes a valid production schedule while strictly enforcing all operational constraints.

The solution is implemented in **TypeScript**, uses **Luxon** for robust time handling, and includes automated tests to validate core scheduling behavior.

---

## Key Features

The reflow algorithm enforces the following hard constraints:

- **Dependency Management**
  - Multi-parent dependencies supported
  - All parent work orders must complete before a child begins
  - Cycle detection via topological sorting (Kahn’s algorithm)

- **Work Center Constraints**
  - No overlapping work orders per work center
  - Deterministic conflict resolution
  - Forward-only scheduling (no pulling earlier than original start)

- **Shift Awareness**
  - Work is calculated in working minutes (not elapsed time)
  - Work pauses outside shift hours and resumes in the next valid shift

- **Maintenance Handling**
  - Maintenance windows treated as blocked intervals
  - Maintenance work orders are fixed and cannot be rescheduled

- **Explainability**
  - Each rescheduled work order includes:
    - Original vs. updated dates
    - Delta in minutes
    - Structured reason codes
    - Human-readable explanation (`why` field)

---

## How to Run

### 1. Install Dependencies

```bash
npm install
```

### 2. Type Check

```bash
npm run typecheck
```

### 3. Run Tests

```bash
npm run test:run
```

### 4. Execute Sample Scenarios

```bash
npm start
```

---

## Project Structure

```
src/
├── reflow/
│   ├── reflow.service.ts        # Core scheduling algorithm
│   ├── dependency-graph.ts      # Topological sort + cycle detection
│   ├── constraint-checker.ts    # Post-schedule validation
│   └── types.ts                 # Domain types
└── utils/
    ├── date-utils.ts            # Shift-aware time calculation
    └── intervals.ts             # Interval utilities
tests/
```

---

## Algorithm Design

The scheduling process follows a deterministic pipeline:

### 1. Validation
- Verify work center references
- Verify dependency references
- Ensure valid durations

### 2. Fixed Block Construction
For each work center:
- Load maintenance windows
- Load fixed maintenance work orders
- Merge into non-overlapping blocked intervals

### 3. Dependency Resolution
- Perform topological sort
- Detect circular dependencies
- Fail fast if a cycle exists

### 4. Scheduling Execution
For each non-maintenance work order (in topo order):

- Compute dependency readiness time  
- Compute resource readiness (latest end time on the work center)  
- Align to the next valid working instant  
- Apply shift-aware working time calculation  
- Skip maintenance windows  
- Retry if work center conflicts occur  

### 5. Final Validation
- Ensure no overlaps
- Ensure all constraints are satisfied
- Return updated schedule and change explanations

---

## Shift Behavior

Work duration is applied only during active shift hours.

Example:

- Duration: 120 minutes  
- Start: Monday 16:00  
- Shift: 08:00–17:00  

Result:

- Works 60 minutes Monday (16:00–17:00)
- Pauses overnight
- Resumes Tuesday at 08:00
- Finishes at 09:00

---

## Demonstrated Scenarios

1. **Delay Cascade**  
   Upstream delay propagates through dependent work orders.

2. **Shift Spanning**  
   Work pauses at shift boundary and resumes next shift.

3. **Maintenance + Multi-Parent Dependencies**  
   Combined constraint case with maintenance blocking and multiple parents.
   
4. **Work Center Conflict Resolution**  
   Multiple work orders competing for the same work center are automatically sequenced without overlaps.
---

## Testing

Automated tests validate:

- Topological sorting
- Cycle detection
- Shift boundary handling
- Maintenance window skipping

Run:

```bash
npm run test:run
```
All tests pass successfully and validate dependency handling, cycle detection, shift boundaries, and maintenance window logic.
---

## Design Decisions

- Greedy earliest-feasible scheduling
- Deterministic ordering for reproducibility
- Forward-only reflow to prevent retroactive movement
- Maintenance modeled as hard-block intervals
- Explicit constraint validation after scheduling

---

## Known Limitations

- No delay optimization (does not minimize total downstream impact)
- No parallel capacity modeling per work center
- No setup time handling (future extension)

---

## Future Enhancements

- Setup time support
- Optimization metrics (total delay, utilization)
- Idle time analysis
- Enhanced diagnostics for impossible schedules
- Performance tuning for large-scale workloads

---

## Conclusion

This implementation produces a valid, constraint-compliant production schedule and provides transparent explanations for every scheduling adjustment.

The system is deterministic, test-backed, and structured for extensibility.