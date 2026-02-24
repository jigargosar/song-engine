import { Project, SyntaxKind, Node, SourceFile } from 'ts-morph'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const project = new Project({ tsConfigFilePath: 'tsconfig.json' })
const srcFiles = project.getSourceFiles().filter((f) => !f.getFilePath().includes('node_modules'))

// --- Types ---

interface ModuleCoupling {
    sourceModule: string
    importedSymbols: string[]
    calls: { symbol: string; count: number }[]
    totalCalls: number
}

interface ExportRatio {
    total: number
    exported: number
    ratio: number
    names: { name: string; isExported: boolean }[]
}

interface FileReport {
    path: string
    totalInteractions: number
    moduleCoupling: ModuleCoupling[]
    exportRatio: ExportRatio
}

interface AuditReport {
    generated: string
    files: FileReport[]
}

// --- Import analysis ---

function getImports(file: SourceFile): Map<string, { module: string; symbols: string[] }> {
    const map = new Map<string, { module: string; symbols: string[] }>()
    for (const decl of file.getImportDeclarations()) {
        const mod = decl.getModuleSpecifierValue()
        if (!mod.startsWith('.')) continue

        const symbols: string[] = []
        for (const named of decl.getNamedImports()) {
            symbols.push(named.getName())
        }
        const def = decl.getDefaultImport()
        if (def) symbols.push(def.getText())

        if (symbols.length > 0) {
            const existing = map.get(mod)
            if (existing) {
                existing.symbols.push(...symbols)
            } else {
                map.set(mod, { module: mod, symbols })
            }
        }
    }
    return map
}

// --- Call counting ---

function countCalls(file: SourceFile, symbols: string[]): Map<string, number> {
    const counts = new Map<string, number>()
    const allCalls = file.getDescendantsOfKind(SyntaxKind.CallExpression)

    for (const sym of symbols) {
        let count = 0
        for (const call of allCalls) {
            const expr = call.getExpression()
            if (Node.isIdentifier(expr) && expr.getText() === sym) {
                count++
            }
        }
        if (count > 0) {
            counts.set(sym, count)
        }
    }
    return counts
}

// --- Export ratio ---

function getExportRatio(file: SourceFile): ExportRatio {
    const names: { name: string; isExported: boolean }[] = []

    for (const fn of file.getFunctions()) {
        const name = fn.getName() ?? '<anonymous>'
        names.push({ name, isExported: fn.isExported() })
    }

    for (const stmt of file.getVariableStatements()) {
        const isExp = stmt.isExported()
        for (const decl of stmt.getDeclarations()) {
            names.push({ name: decl.getName(), isExported: isExp })
        }
    }

    for (const ta of file.getTypeAliases()) {
        names.push({ name: ta.getName(), isExported: ta.isExported() })
    }

    for (const iface of file.getInterfaces()) {
        names.push({ name: iface.getName(), isExported: iface.isExported() })
    }

    const total = names.length
    const exported = names.filter((n) => n.isExported).length
    const ratio = total > 0 ? Math.round((exported / total) * 100) : 0

    return { total, exported, ratio, names }
}

// --- Build report ---

function buildFileReport(file: SourceFile): FileReport {
    const cwd = process.cwd().replace(/\\/g, '/')
    const path = file.getFilePath().replace(cwd, '.')

    const imports = getImports(file)
    const moduleCoupling: ModuleCoupling[] = []
    let totalInteractions = 0

    for (const [mod, { symbols }] of imports) {
        const callCounts = countCalls(file, symbols)
        const calls: { symbol: string; count: number }[] = []

        for (const sym of symbols) {
            const count = callCounts.get(sym) ?? 0
            if (count > 0) {
                calls.push({ symbol: sym, count })
            }
        }

        const totalCalls = calls.reduce((sum, c) => sum + c.count, 0)
        totalInteractions += totalCalls

        moduleCoupling.push({
            sourceModule: mod,
            importedSymbols: symbols,
            calls,
            totalCalls,
        })
    }

    moduleCoupling.sort((a, b) => b.totalCalls - a.totalCalls)

    const exportRatio = getExportRatio(file)

    return { path, totalInteractions, moduleCoupling, exportRatio }
}

// --- Run ---

const report: AuditReport = {
    generated: new Date().toISOString(),
    files: srcFiles.map(buildFileReport).sort((a, b) => b.totalInteractions - a.totalInteractions),
}

// Write JSON
const jsonPath = 'scripts/audit-report.json'
writeFileSync(jsonPath, JSON.stringify(report, null, 2))

// Generate self-contained HTML dashboard
const templatePath = resolve('scripts/audit-dashboard.html')
const template = readFileSync(templatePath, 'utf-8')
const inlineScript = `<script>window.__AUDIT_DATA__ = ${JSON.stringify(report)};</script>`
const htmlOutput = template.replace('<head>', `<head>\n${inlineScript}`)
const htmlPath = 'scripts/audit-report.html'
writeFileSync(htmlPath, htmlOutput)

console.log(`JSON:  ${jsonPath}`)
console.log(`HTML:  ${htmlPath} (self-contained, open directly)`)
console.log(`Files: ${report.files.length}`)

const totalInteractions = report.files.reduce((sum, f) => sum + f.totalInteractions, 0)
console.log(`Interactions: ${totalInteractions}`)

const highExport = report.files.filter((f) => f.exportRatio.ratio > 50)
console.log(`PLOP flags: ${highExport.length} modules with >50% export ratio`)
