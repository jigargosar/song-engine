import { Project, SyntaxKind, Node, SourceFile, CallExpression } from 'ts-morph'

const project = new Project({ tsConfigFilePath: 'tsconfig.json' })
const srcFiles = project.getSourceFiles().filter((f) => !f.getFilePath().includes('node_modules'))

// Build map: symbol name -> source module (relative specifier)
function buildImportMap(file: SourceFile): Map<string, string> {
    const map = new Map<string, string>()
    for (const decl of file.getImportDeclarations()) {
        const mod = decl.getModuleSpecifierValue()
        if (!mod.startsWith('.')) continue
        for (const named of decl.getNamedImports()) {
            map.set(named.getName(), mod)
        }
        const def = decl.getDefaultImport()
        if (def) map.set(def.getText(), mod)
    }
    return map
}

// Find all variable declarations whose initializer is a call to an imported function
interface TrackedReturn {
    varName: string
    sourceModule: string
    sourceFn: string
    line: number
    operations: string[]
}

function findReturnValueOperations(file: SourceFile, importMap: Map<string, string>): TrackedReturn[] {
    const results: TrackedReturn[] = []

    // Find: const x = importedFn(...)
    for (const varDecl of file.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
        const init = varDecl.getInitializer()
        if (!init) continue

        // Check if initializer is a call to an imported function
        let calledFn: string | undefined
        let callNode: CallExpression | undefined

        if (Node.isCallExpression(init)) {
            callNode = init
            const expr = init.getExpression()
            if (Node.isIdentifier(expr)) {
                calledFn = expr.getText()
            }
        }

        // Also match: const x = importedFn(...) as Type
        if (Node.isAsExpression(init)) {
            const inner = init.getExpression()
            if (Node.isCallExpression(inner)) {
                callNode = inner
                const expr = inner.getExpression()
                if (Node.isIdentifier(expr)) {
                    calledFn = expr.getText()
                }
            }
        }

        if (!calledFn || !callNode) continue
        const sourceModule = importMap.get(calledFn)
        if (!sourceModule) continue

        // Track what happens to this variable
        const varName = varDecl.getName()
        const operations: string[] = []

        // Was there an `as` cast at assignment?
        if (Node.isAsExpression(varDecl.getInitializer()!)) {
            operations.push(`as cast at assignment`)
        }

        // Find all references to this variable in the same file
        const nameNode = varDecl.getNameNode()
        if (!Node.isIdentifier(nameNode)) continue

        const refs = nameNode.findReferencesAsNodes()
        for (const ref of refs) {
            if (ref === nameNode) continue // skip the declaration itself

            const parent = ref.getParent()
            if (!parent) continue

            const line = ref.getStartLineNumber()

            // 1. Arithmetic: varName + N, varName - N, etc.
            if (Node.isBinaryExpression(parent)) {
                operations.push(`L${line}: arithmetic (${parent.getText()})`)
            }

            // 2. As cast: varName as Type
            if (Node.isAsExpression(parent)) {
                operations.push(`L${line}: as cast (${parent.getText()})`)
            }

            // 3. Property access: varName.prop
            if (Node.isPropertyAccessExpression(parent) && parent.getExpression() === ref) {
                operations.push(`L${line}: property access (.${parent.getName()})`)
            }

            // 4. Element access: varName[index]
            if (Node.isElementAccessExpression(parent) && parent.getExpression() === ref) {
                operations.push(`L${line}: element access (${parent.getText()})`)
            }

            // 5. Method call: varName.method()
            if (Node.isPropertyAccessExpression(parent) && parent.getExpression() === ref) {
                const grandparent = parent.getParent()
                if (grandparent && Node.isCallExpression(grandparent) && grandparent.getExpression() === parent) {
                    operations.push(`L${line}: method call (.${parent.getName()}())`)
                }
            }

            // 6. Conditional: if (varName === ...) or varName > ...
            if (Node.isBinaryExpression(parent)) {
                const op = parent.getOperatorToken().getText()
                if (['===', '!==', '==', '!=', '>', '<', '>=', '<='].includes(op)) {
                    operations.push(`L${line}: comparison (${parent.getText()})`)
                }
            }

            // 7. Destructuring: const { a, b } = varName (rare but possible via reassign)
            // Handled at declaration level separately below

            // 8. Spread: { ...varName } or [...varName]
            if (Node.isSpreadElement(parent) || Node.isSpreadAssignment(parent)) {
                operations.push(`L${line}: spread`)
            }

            // 9. Template literal: `${varName}`
            if (Node.isTemplateSpan(parent)) {
                operations.push(`L${line}: template interpolation`)
            }

            // 10. Passed as argument to a function from the SAME module
            if (Node.isCallExpression(parent)) {
                const callee = parent.getExpression()
                if (Node.isIdentifier(callee)) {
                    const calleeMod = importMap.get(callee.getText())
                    if (calleeMod === sourceModule) {
                        operations.push(
                            `L${line}: passed back to ${callee.getText()} (same module: ${sourceModule})`,
                        )
                    }
                }
            }

            // 10b. Passed as argument nested inside a call to same module
            const grandparent = parent.getParent()
            if (grandparent && Node.isCallExpression(grandparent)) {
                const callee = grandparent.getExpression()
                if (Node.isIdentifier(callee)) {
                    const calleeMod = importMap.get(callee.getText())
                    if (calleeMod === sourceModule) {
                        operations.push(
                            `L${line}: passed back to ${callee.getText()} (same module: ${sourceModule})`,
                        )
                    }
                }
            }
        }

        if (operations.length > 0) {
            results.push({
                varName,
                sourceModule,
                sourceFn: calledFn,
                line: varDecl.getStartLineNumber(),
                operations,
            })
        }
    }

    return results
}

// --- Run ---

console.log('=== TDA Audit: Return Value Processing ===\n')

let totalFindings = 0

for (const file of srcFiles) {
    const filePath = file.getFilePath().replace(process.cwd().replace(/\\/g, '/'), '.')
    const importMap = buildImportMap(file)
    const findings = findReturnValueOperations(file, importMap)

    if (findings.length > 0) {
        console.log(filePath)
        for (const f of findings) {
            console.log(`  L${f.line}: ${f.varName} = ${f.sourceFn}() [from ${f.sourceModule}]`)
            for (const op of f.operations) {
                console.log(`    - ${op}`)
            }
        }
        console.log()
        totalFindings += findings.length
    }
}

console.log(`Total: ${totalFindings} returned values with caller-side processing\n`)
