# Opus Agent Task Notes (Builder-side)

This complements API usage by documenting how Opus Agent behaves in workflow design.

Primary page:
- https://developer.opus.com/tasks/agent/opus-agent

## What Opus Agent does
- Converts natural language goals into a generated blueprint with required steps.
- Infers typed input/output variables for downstream workflow wiring.
- Supports iterative regeneration/refinement while preserving intent.

## Blueprint structure
Each generated step includes:
- `Objective`: target outcome for the step
- `Description`: how the step is executed

## Operating modes
- `Lite`: faster setup and common reasoning/extraction/generation tasks
- `Advanced`: convert blueprint to code for full control

## Builder best practices for API stability
- Stabilize input/output variable types early.
- Prefer structured JSON outputs for downstream branching and serialization.
- Re-run preview tests with representative inputs before activation.
- If IO changes materially, regenerate blueprint and re-validate API payload mapping.

## Common output patterns
- Summarization: `summary` + `key_points`
- Extraction: object-shaped field map
- Classification: `classification` + numeric `confidence`

## Agent handoff guidance
When an agent is consuming this workflow via API:
- Align `jobPayloadSchemaInstance` variable keys to current workflow schema.
- Keep `displayName` populated in execute payload entries.
- Validate output shape from `/results` before chaining to downstream systems.
