---
name: scenario
description: Create, edit, or upgrade scenarios and simulations.
---

# Scenario Workflow

## North Star

**Scenarios must accurately represent how systems behave in the real world.** Before implementing, first analyze and understand how the real system works - routing, failure modes, automatic behaviors. Once you have a clear mental model, proceed to implementation. If a visualization would confuse someone about how the system works, fix it.

## Concepts

- **Graph**: Infrastructure topology (nodes + edges). Defines what exists.
- **Scenario**: Simulation that runs on a graph. Defines what happens (events, token flows).
- **NodeState.metadata**: Arbitrary JSON for dynamic state (e.g., `{ role: "primary" }`). Use for scenario-specific data that algorithms need.

## Adding New Content

### To add a graph:
1. Create JSON in `src/data/graphs/`
2. Export from `src/data/graphs/index.ts`

### To add a scenario:
1. Create JSON in `src/data/scenarios/`
2. Export from `src/data/scenarios/index.ts`
3. Set `graphId` to match the target graph's `id`

## Key Files

- Graphs: `src/data/graphs/`
- Scenarios: `src/data/scenarios/`
- Types: `src/types/scenario.ts`, `src/types/graph-type.ts`
- Engine: `src/lib/scenario-engine/`

## Debugging

When debugging scenarios, **do not run dev server**. Instead:
1. Analyze the JSON structure and code logic
2. Write and run specific tests to verify behavior
3. Check path selectors, event handlers, and token routing logic

## Scenario Checklist

- [ ] `graphId` matches a graph in `src/data/graphs/`
- [ ] Exported from `src/data/scenarios/index.ts`
- [ ] `tokenFlowConfig.defaultEdgeDurationMs` set
- [ ] `requestFlows` paths use valid node IDs
- [ ] Events ordered by `timestampMs`
