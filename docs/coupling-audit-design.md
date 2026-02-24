Coupling Audit — Design & Learnings

## Problem

TDA (Tell, Don't Ask), PLOP (Principle of Least Privilege), and Encapsulation violations are design-level issues that no linter can mechanically detect. But they have observable **smells** — syntactic patterns that correlate with violations. We can detect smells, then let humans interpret.

## Principles

- TDA, PLOP, and Encapsulation are non-negotiable design principles
- Violations are design judgments, not syntax errors — tools detect smells, humans interpret
- Separate **data collection** from **presentation** — structured JSON output, then visual report
- Start with high-confidence signals (counts), add micro-heuristics only if counts are ambiguous

## Smell Categories

### TDA (Tell, Don't Ask)

Caller retrieves data from a module and processes it locally, instead of telling the module what it needs.

Signals (high confidence):
- Import count from a single module (3+ symbols = coupling breadth)
- Call count to a single module (3+ calls = coupling depth)
- Total interactions per file (sum of all calls to all modules = responsibility)

Signals (micro-heuristics, future):
- **Unwrap-operate-rewrap:** `as` cast on return value, arithmetic, pass back to same module
- **Ask then decide:** get value, branch/compare on it
- **Ask A, tell B:** get value from module A, pass it as argument to module B (middleman)
- **Excessive property access:** many `.prop` reads on a single returned value
- **Method call chains:** multiple `.method()` calls on a returned object

### PLOP (Principle of Least Privilege)

Module exposes more than callers need.

Signals (high confidence):
- Export ratio > 50% (exported declarations / total declarations)

Signals (micro-heuristics, future):
- Exported constructors that accept arbitrary values without validation
- Exported symbols with zero external consumers
- Mutable exports (`export let`)

### Encapsulation

Internal structure is leaked to callers.

Signals (high confidence):
- Export ratio 100% = everything public, nothing hidden

Signals (micro-heuristics, future):
- Callers accessing internal data structure (element access `arr[i]` on returned arrays)
- Callers destructuring returned objects
- Callers spreading returned values `{ ...fn() }`

## Detection Patterns (Complete List)

Operations detected on returned values from imported functions:

```
+-----+==============================+====================+
| #   | Pattern                      | Smell category     |
+-----+==============================+====================+
| 1   | as cast                      | TDA, Encapsulation |
+-----+------------------------------+--------------------+
| 2   | Arithmetic (+, -, *, /)      | TDA                |
+-----+------------------------------+--------------------+
| 3   | Property access (.prop)      | TDA, Encapsulation |
+-----+------------------------------+--------------------+
| 4   | Element access ([index])     | Encapsulation      |
+-----+------------------------------+--------------------+
| 5   | Method call (.method())      | TDA                |
+-----+------------------------------+--------------------+
| 6   | Comparison (===, >, <, etc.) | TDA                |
+-----+------------------------------+--------------------+
| 7   | Spread ({...x}, [...x])      | Encapsulation      |
+-----+------------------------------+--------------------+
| 8   | Template interpolation       | TDA                |
|     | (`${x}`)                     |                    |
+-----+------------------------------+--------------------+
| 9   | Passed back to same module   | TDA                |
+-----+------------------------------+--------------------+
| 10  | Passed to different module   | TDA (middleman)    |
|     | (ask A, tell B)              |                    |
+-----+------------------------------+--------------------+
```

## Data Structure

The script outputs structured JSON:

```ts
interface AuditReport {
    files: FileReport[]
}

interface FileReport {
    path: string
    totalInteractions: number
    moduleBreakdown: ModuleCoupling[]
    returnValues: ReturnValueReport[]
    exportRatio: ExportRatio
}

interface ModuleCoupling {
    sourceModule: string
    importedSymbols: number
    totalCalls: number
    propertyAccesses: number
    passedToOtherModules: CrossModuleFlow[]
}

interface CrossModuleFlow {
    fromModule: string
    toModule: string
    viaVariable: string
    line: number
}

interface ReturnValueReport {
    varName: string
    sourceModule: string
    sourceFn: string
    line: number
    operations: Operation[]
    depth: number
    patterns: SmellPattern[]
}

interface Operation {
    type: 'as_cast' | 'arithmetic' | 'property_access' | 'element_access'
        | 'method_call' | 'comparison' | 'spread' | 'template'
        | 'passed_same_module' | 'passed_different_module'
    line: number
    text: string
    targetModule?: string
}

type SmellPattern =
    | 'tda:unwrap_operate_rewrap'
    | 'tda:ask_then_decide'
    | 'tda:ask_a_tell_b'
    | 'tda:excessive_property_access'
    | 'plop:high_export_ratio'
    | 'encapsulation:leaky_internals'
    | 'coupling:god_module'
```

## Implementation Plan

### Phase 1: Basic counts (80% signal)
- Per-file: imports from each module (symbol count)
- Per-file: calls to each imported symbol (call count)
- Per-module: export ratio (exported / total)
- Per-file: total interaction count (sum of all)
- Output: JSON file

### Phase 2: Interactive HTML dashboard
- Read JSON report
- Views: by file, by module, by pattern
- Sortable tables, expandable details
- Color coding by severity thresholds

### Phase 3: Micro-heuristics (if needed)
- Return value tracking (all 10 operation patterns)
- Cross-module flow detection (ask A, tell B)
- Pattern tagging (SmellPattern classification)
- Depth scoring per returned value

## Tools

- **ts-morph** — AST analysis with full type resolution, import tracing
- **tsx** — script runner
- **ESLint** — `as` cast detection (consistent-type-assertions)
- **Biome** — general linting (noExplicitAny, noNonNullAssertion, useConst)
- **tsconfig strict flags** — noUncheckedIndexedAccess, exactOptionalPropertyTypes

## Key Insight

Even if a file is a valid orchestrator (high counts are justified), individual coupling clusters within it still need independent evaluation. "Orchestrator" is not a blanket exemption. Each module relationship (song→note, song→drums, song→dynamics) must be evaluated separately.

Multiple files with similar high counts = systemic coupling, not individual design choices.
