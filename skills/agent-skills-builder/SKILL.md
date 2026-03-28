---
name: agent-skills-builder
description: |
  Builder skill that designs and generates CoreClaw Skills through user dialogue.
  Discovers the true objective behind surface-level requests, then designs,
  generates, validates, and distributes Agent configurations to achieve that objective.
---

# Agent Skills Builder v0.4.0

A builder that creates CoreClaw Skills through dialogue-based requirements discovery.

## Purpose

- Standardize skill creation across the CoreClaw ecosystem
- Deep exploration of user needs through structured dialogue
- Identify the true objective behind surface-level requests
- Concretize requirements through proactive proposals
- Auto-generate sub-agent configurations when needed
- Ensure `docs/SKILLS_GUIDE.md`-compliant directory and file structure
- Guarantee `skill.json` consistency and completeness
- Maintain documentation quality standards
- Reduce release operation errors
- Improve deliverable distribution via ZIP packaging

## Interaction Policy

- Elicit background, purpose, and constraints through user questions
- Always conduct one-question-at-a-time interviews (never bundle multiple questions)
- Confirm the previous answer before proceeding to the next question
- Sequentially confirm: surface request → background problem → success criteria → constraints
- Articulate the true objective in writing and obtain user agreement
- Proactively propose multiple options when requirements are ambiguous
- Show pros, cons, and recommendation rationale concisely for each proposal
- When sub-agents are deemed necessary, present reasoning and architecture for agreement
- Finalize specifications in a form the user can choose from

## Expected Workflow

1. Confirm the surface request (what the user initially wants) via one-question dialogue
2. Sequentially confirm background problem, success criteria, and constraints
3. Articulate the true objective in writing and obtain user agreement
4. Decompose agent responsibilities needed to achieve the true objective; propose single or sub-agent architecture
5. Reference `docs/SKILLS_GUIDE.md` to determine structure type (suite-style / single)
6. After confirming approach, generate required files (`skill.json`, `main.py`, `README.md`, `SKILL.md`)
7. Generate sub-agent (sub-skill) structure and `group.json` when needed
8. Validate naming, version, and entrypoint consistency
9. Bundle deliverables into a downloadable ZIP
10. Suggest release tags

## Input

- Skill name
- Target group (e.g., `scientist`, `enterprise`)
- User's surface request
- Background problem, success criteria, constraints
- Agreed-upon true objective
- Sub-agent requirement (number of roles and responsibility split when needed)
- Required input/output formats
- Version policy (typically starts at `v0.1.0`)
- Operational conditions (deadline, quality requirements, dependencies)

## Output

- Generated Skill package
- Sub-agent (sub-skill) groups when required
- True objective summary (with diff from surface request)
- Proposal comparison (selected vs. alternatives)
- Validation results
- Downloadable ZIP deliverable (with path)
- Release procedure proposal

## Character Limits

- Main skill description: 1500 characters max
- Sub-skill descriptions: 2000 characters max
- Re-summarize and regenerate when limits are exceeded

## Quality Criteria

- `skill.json` contains all required fields
- `entrypoint` matches actual file
- Descriptions are clear and concise
- Compliant with repository conventions (naming, structure)
- Compliant with `docs/SKILLS_GUIDE.md` structure requirements
- Requirements traceable to dialogue log
- One-question-at-a-time dialogue order maintained
- True objective articulated and aligned with designed agent responsibilities
- ZIP deliverable generated with all key files included

---

## Harness Optimization (v0.4.0)

> Optimized following [everything-claude-code](https://github.com/affaan-m/everything-claude-code)
> harness performance patterns: eval-first, multi-phase verification, model routing,
> sub-agent orchestration, and systematic error recovery.

### Eval Criteria (Skill Building)

Before execution, define:
- [ ] **Target skill name**: valid kebab-case identifier
- [ ] **Target group**: existing group or new group creation needed
- [ ] **True objective**: confirmed by user (not just surface request)
- [ ] **Structure type**: single skill vs. suite-style with sub-agents
- [ ] **Completeness**: all required files identified

#### Pass Criteria
- `skill.json` passes schema validation (name, version, description, entrypoint)
- Entrypoint file exists and is importable
- `SKILL.md` contains: description, When to Use, Quick Start, Verification Loop
- `README.md` contains: title, features, quick start, output description
- Naming follows kebab-case convention
- Version follows semver `vX.Y.Z` format
- ZIP bundle contains all generated files
- True objective documented and aligned with agent design

### Verification Loop

```
Phase 1: PLAN
  |-- Confirm true objective via 1-question dialogue
  |-- Determine structure type (single / suite-style)
  |-- List all files to generate
  +-- Estimate character counts against limits

Phase 2: EXECUTE
  |-- Generate skill.json with required fields
  |-- Generate main.py entrypoint
  |-- Generate SKILL.md with full structure
  |-- Generate README.md with usage guide
  |-- Generate sub-agent files if suite-style
  +-- Bundle into ZIP

Phase 3: VERIFY
  |-- Validate skill.json schema (name, version, description, entrypoint)
  |-- Confirm entrypoint file exists
  |-- Check character limits (main <= 1500, sub <= 2000)
  |-- Verify naming convention compliance
  |-- Cross-check true objective alignment
  +-- Test ZIP integrity

Phase 4: RECOVER (on failure)
  |-- Identify which file or field failed validation
  |-- Regenerate only the failed component
  |-- Re-summarize if character limit exceeded
  |-- Log fix as reusable pattern
  +-- If unrecoverable: deliver partial package with documented gaps

Phase 5: REPORT
  |-- Present generated file list to user
  |-- Show validation results
  |-- Provide ZIP download path
  |-- Suggest release tag format
  +-- Record true objective summary and proposal comparison
```

### Quality Gates

| Gate | Check | Required |
|------|-------|----------|
| G1 | `skill.json` has all required fields | MUST |
| G2 | Entrypoint file matches `skill.json.entrypoint` | MUST |
| G3 | SKILL.md contains description + When to Use + Quick Start | MUST |
| G4 | Naming follows kebab-case convention | MUST |
| G5 | Version follows semver `vX.Y.Z` | MUST |
| G6 | Character limits respected (main 1500 / sub 2000) | MUST |
| G7 | ZIP bundle generated and non-empty | MUST |
| G8 | True objective documented and user-confirmed | MUST |
| G9 | One-question-at-a-time dialogue maintained | RECOMMENDED |
| G10 | Release tag suggestion provided | RECOMMENDED |

### Model Routing

| Task Complexity | Model Tier | Examples |
|----------------|-----------|----------|
| Mechanical | `fast` (haiku-class) | File scaffolding, JSON generation, ZIP bundling |
| Implementation | `standard` (sonnet-class) | SKILL.md writing, README generation, validation |
| Reasoning | `premium` (opus-class) | True objective discovery, architecture decisions, proposal comparison |

### Sub-Agent Orchestration

For suite-style skill packages, split generation into parallel agents:

```
Orchestrator (this skill)
|-- Agent 1: Requirements discovery and true objective articulation
|-- Agent 2: Skill architecture design and file structure planning
|-- Agent 3: File generation (skill.json, main.py, SKILL.md, README.md)
+-- Agent 4: Validation, ZIP bundling, and release preparation
```

### Token Optimization

- Use structured JSON for intermediate skill specifications (not prose)
- Generate files from templates rather than free-form writing
- Cache `docs/SKILLS_GUIDE.md` structure requirements (avoid re-reading)
- Compact dialogue history after true objective confirmation
- Prefer code generation over natural language descriptions for entrypoints

### Error Recovery Protocol

```python
def validate_skill_package(skill_dir):
    """Validate generated skill package against quality gates."""
    errors = []
    
    # G1: skill.json schema
    skill_json = skill_dir / "skill.json"
    if not skill_json.exists():
        errors.append("G1: skill.json missing")
    else:
        data = json.loads(skill_json.read_text())
        for field in ["name", "version", "description", "entrypoint"]:
            if field not in data:
                errors.append(f"G1: skill.json missing '{field}'")
    
    # G2: entrypoint exists
    if skill_json.exists():
        ep = data.get("entrypoint", "main.py")
        if not (skill_dir / ep).exists():
            errors.append(f"G2: entrypoint '{ep}' not found")
    
    # G4: naming convention
    if not re.match(r'^[a-z][a-z0-9-]*$', data.get("name", "")):
        errors.append("G4: name not kebab-case")
    
    # G5: semver
    if not re.match(r'^v\d+\.\d+\.\d+$', data.get("version", "")):
        errors.append("G5: version not semver vX.Y.Z")
    
    return errors
```
