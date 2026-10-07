import {
  parseSync,
  ArrowFunctionExpression,
  Node,
  Statement,
  TSSignature,
  TSType,
} from "oxc-parser"

export type StructureViolation = Readonly<{
  rule: "usecase-factory" | "ports-atomic"
  file: string
  message: string
}>

const usecaseFactoryMessage = "backend skill: use case files export a curried make<Action> factory"

const portsAtomicMessage = (name: string, count: number): string =>
  `backend skill: ports are atomic function types; ${name} bundles ${count} functions`

const isArrowFunction = (node: Node | null): node is ArrowFunctionExpression =>
  node !== null && node.type === "ArrowFunctionExpression"

const arrowReturnsFunction = (factory: ArrowFunctionExpression): boolean => {
  const body = factory.body
  if (isArrowFunction(body)) return true
  if (body.type !== "BlockStatement") return false
  return body.body.some(
    (statement) => statement.type === "ReturnStatement" && isArrowFunction(statement.argument),
  )
}

const makeFactoryInit = (statement: Statement): Node | null => {
  if (statement.type !== "ExportNamedDeclaration") return null
  const declaration = statement.declaration
  if (declaration === null || declaration.type !== "VariableDeclaration") return null
  for (const declarator of declaration.declarations) {
    const id = declarator.id
    if (id.type !== "Identifier") continue
    if (!/^make[A-Z]/.test(id.name)) continue
    return declarator.init
  }
  return null
}

const checkUsecaseFile = (fileName: string, source: string): readonly StructureViolation[] => {
  const factories = parseSync(fileName, source)
    .program.body.map(makeFactoryInit)
    .filter((init) => init !== null)
  const compliant =
    factories.length > 0 &&
    factories.every((init) => isArrowFunction(init) && arrowReturnsFunction(init))
  return compliant
    ? []
    : [{ rule: "usecase-factory", file: fileName, message: usecaseFactoryMessage }]
}

const objectTypeMembers = (annotation: TSType): readonly TSSignature[] | null => {
  if (annotation.type === "TSTypeLiteral") return annotation.members
  if (annotation.type === "TSTypeReference") {
    const argument = annotation.typeArguments?.params[0]
    if (argument !== undefined && argument.type === "TSTypeLiteral") return argument.members
  }
  return null
}

const isFunctionMember = (member: TSSignature): boolean =>
  member.type === "TSMethodSignature" ||
  (member.type === "TSPropertySignature" &&
    member.typeAnnotation?.typeAnnotation.type === "TSFunctionType")

const checkPortsFile = (fileName: string, source: string): readonly StructureViolation[] => {
  const violations: StructureViolation[] = []
  for (const statement of parseSync(fileName, source).program.body) {
    if (statement.type !== "ExportNamedDeclaration") continue
    const declaration = statement.declaration
    if (declaration === null || declaration.type !== "TSTypeAliasDeclaration") continue
    const members = objectTypeMembers(declaration.typeAnnotation)
    if (members === null) continue
    const functionMembers = members.filter(isFunctionMember).length
    if (functionMembers < 2) continue
    violations.push({
      rule: "ports-atomic",
      file: fileName,
      message: portsAtomicMessage(declaration.id.name, functionMembers),
    })
  }
  return violations
}

export const checkStructure = (fileName: string, source: string): readonly StructureViolation[] => {
  if (fileName.endsWith(".usecase.ts")) return checkUsecaseFile(fileName, source)
  if (fileName.endsWith(".ports.ts")) return checkPortsFile(fileName, source)
  return []
}
