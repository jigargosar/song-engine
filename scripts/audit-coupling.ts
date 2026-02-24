import { Project, SyntaxKind, SourceFile } from 'ts-morph'

const project = new Project({ tsConfigFilePath: 'tsconfig.json' })
const srcFiles = project.getSourceFiles().filter((f) => !f.getFilePath().includes('node_modules'))

// --- Signal 1: Import count per source module ---

interface ImportProfile {
    from: string
    symbols: string[]
}

function getImportProfiles(file: SourceFile): ImportProfile[] {
    const profiles: ImportProfile[] = []
    for (const decl of file.getImportDeclarations()) {
        const moduleSpecifier = decl.getModuleSpecifierValue()
        if (!moduleSpecifier.startsWith('.')) continue
        const named = decl.getNamedImports().map((n) => n.getName())
        const defaultImport = decl.getDefaultImport()?.getText()
        const symbols = [...named]
        if (defaultImport) symbols.push(defaultImport)
        if (symbols.length > 0) {
            profiles.push({ from: moduleSpecifier, symbols })
        }
    }
    return profiles
}

// --- Signal 2: Call count per imported symbol ---

interface CallProfile {
    symbol: string
    sourceModule: string
    count: number
}

function getCallCounts(file: SourceFile, imports: ImportProfile[]): CallProfile[] {
    const profiles: CallProfile[] = []
    const allCalls = file.getDescendantsOfKind(SyntaxKind.CallExpression)

    for (const imp of imports) {
        for (const sym of imp.symbols) {
            const count = allCalls.filter((call) => {
                const expr = call.getExpression()
                return expr.getKind() === SyntaxKind.Identifier && expr.getText() === sym
            }).length
            if (count > 0) {
                profiles.push({ symbol: sym, sourceModule: imp.from, count })
            }
        }
    }
    return profiles
}

// --- Signal 3: Module coupling (imports * calls from same module) ---

interface CouplingReport {
    sourceModule: string
    importedSymbols: number
    totalCalls: number
    details: CallProfile[]
}

function getCouplingReport(
    imports: ImportProfile[],
    calls: CallProfile[],
): CouplingReport[] {
    const byModule = new Map<string, { symbols: Set<string>; calls: CallProfile[] }>()

    for (const imp of imports) {
        if (!byModule.has(imp.from)) {
            byModule.set(imp.from, { symbols: new Set(), calls: [] })
        }
        const entry = byModule.get(imp.from)!
        for (const s of imp.symbols) entry.symbols.add(s)
    }

    for (const call of calls) {
        const entry = byModule.get(call.sourceModule)
        if (entry) entry.calls.push(call)
    }

    const reports: CouplingReport[] = []
    for (const [mod, entry] of byModule) {
        const totalCalls = entry.calls.reduce((sum, c) => sum + c.count, 0)
        reports.push({
            sourceModule: mod,
            importedSymbols: entry.symbols.size,
            totalCalls,
            details: entry.calls,
        })
    }

    return reports.sort((a, b) => b.totalCalls - a.totalCalls)
}

// --- Signal 4: Export ratio per module (PLOP) ---

interface ExportRatio {
    file: string
    total: number
    exported: number
    ratio: string
}

function getExportRatio(file: SourceFile): ExportRatio {
    const allDecls = [
        ...file.getFunctions(),
        ...file.getVariableStatements().flatMap((v) => v.getDeclarations()),
        ...file.getTypeAliases(),
        ...file.getInterfaces(),
    ]
    const exported = allDecls.filter((d) => {
        if ('isExported' in d && typeof d.isExported === 'function') {
            return d.isExported()
        }
        return false
    })

    const total = allDecls.length
    const exp = exported.length
    return {
        file: file.getFilePath().replace(process.cwd().replace(/\\/g, '/'), '.'),
        total,
        exported: exp,
        ratio: total > 0 ? `${Math.round((exp / total) * 100)}%` : 'N/A',
    }
}

// --- Run ---

const TDA_IMPORT_THRESHOLD = 3
const TDA_CALL_THRESHOLD = 3

console.log('=== Module Coupling Audit ===\n')

for (const file of srcFiles) {
    const filePath = file.getFilePath().replace(process.cwd().replace(/\\/g, '/'), '.')
    const imports = getImportProfiles(file)
    const calls = getCallCounts(file, imports)
    const coupling = getCouplingReport(imports, calls)

    const smells = coupling.filter(
        (c) => c.importedSymbols >= TDA_IMPORT_THRESHOLD || c.totalCalls >= TDA_CALL_THRESHOLD,
    )

    if (smells.length > 0) {
        console.log(`${filePath}`)
        for (const smell of smells) {
            console.log(
                `  -> ${smell.sourceModule}: ${smell.importedSymbols} imports, ${smell.totalCalls} calls`,
            )
            for (const d of smell.details) {
                console.log(`     ${d.symbol}: ${d.count}x`)
            }
        }
        console.log()
    }
}

console.log('\n=== Export Ratio (PLOP) ===\n')

const ratios = srcFiles.map(getExportRatio).sort((a, b) => {
    const ra = parseInt(a.ratio) || 0
    const rb = parseInt(b.ratio) || 0
    return rb - ra
})

for (const r of ratios) {
    const flag = parseInt(r.ratio) > 50 ? ' <-- review' : ''
    console.log(`${r.file}: ${r.exported}/${r.total} (${r.ratio})${flag}`)
}

console.log()
