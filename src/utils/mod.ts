import { consAtom } from '../constants/atoms.js';
import { Program } from '../index.js';
import { BetterSet } from '../types/BetterSet.js';
import { NodePath } from '../types/NodePath.js';
import { compareStrings } from './compare';
import { Eval, evalAsProgram, Group, quoteAsProgram } from './helpers.js';
import { optimizeProgram } from './optimize.js';

const mainName = '';

export function buildTree(items: Program[]): Program {
    if (items.length === 0) return Program.nil;
    else if (items.length === 1) return items[0];
    const halfSize = items.length >> 1;
    return Program.cons(
        buildTree(items.slice(0, halfSize)),
        buildTree(items.slice(halfSize))
    );
}

export function buildTreeProgram(items: Program[]): Program {
    if (items.length === 0)
        return Program.fromList([quoteAsProgram(Program.nil)]);
    else if (items.length === 1) return items[0];
    const halfSize = items.length >> 1;
    return Program.fromList([
        Program.fromBytes(consAtom),
        buildTreeProgram(items.slice(0, halfSize)),
        buildTreeProgram(items.slice(halfSize)),
    ]);
}

export function flatten(program: Program): string[] {
    if (program.isCons)
        return [...flatten(program.first), ...flatten(program.rest)];
    else return [program.toText()];
}

export function buildUsedConstantNames(
    functions: Group,
    constants: Group,
    macros: Program[]
): BetterSet<string> {
    const macrosAsDict: Group = {};
    for (const item of macros) macrosAsDict[item.rest.first.toText()] = item;
    const possibleSymbols = new BetterSet(Object.keys(functions));
    possibleSymbols.update(new BetterSet(Object.keys(constants)));
    let newNames = new BetterSet([mainName]);
    const usedNames = new BetterSet(newNames);
    while (newNames.size) {
        const priorNewNames = new BetterSet(newNames);
        newNames = new BetterSet<string>();
        for (const item of priorNewNames) {
            for (const group of [functions, macrosAsDict]) {
                if (item in group)
                    newNames.update(new BetterSet(flatten(group[item])));
            }
        }
        newNames.differenceUpdate(usedNames);
        usedNames.update(newNames);
    }
    usedNames.intersectionUpdate(possibleSymbols);
    usedNames.delete(mainName);
    return usedNames.sort((a, b) => compareStrings(a, b));
}

export function parseInclude(
    name: Program,
    namespace: BetterSet<string>,
    functions: Group,
    constants: Group,
    macros: Program[],
    runProgram: Eval
): void {
    const program = Program.fromSource('(_read (_full_path_for_name 1))');
    const output = runProgram(program, name).value;
    for (const item of output.toList())
        parseModProgram(
            item,
            namespace,
            functions,
            constants,
            macros,
            runProgram
        );
}

export function unquoteArgs(program: Program, args: string[]): Program {
    if (program.isCons) {
        return Program.cons(
            unquoteArgs(program.first, args),
            unquoteArgs(program.rest, args)
        );
    } else if (args.includes(program.toText())) {
        return Program.fromList([Program.fromText('unquote'), program]);
    }
    return program;
}

export function defunInlineToMacro(program: Program): Program {
    const second = program.rest;
    const third = second.rest;
    const items = [Program.fromText('defmacro'), second.first, third.first];
    const code = third.rest.first;
    const args = flatten(third.first).filter((item) => item.length);
    const unquotedCode = unquoteArgs(code, args);
    items.push(Program.fromList([Program.fromText('qq'), unquotedCode]));
    return Program.fromList(items);
}

export function parseModProgram(
    declarationProgram: Program,
    namespace: BetterSet<string>,
    functions: Group,
    constants: Group,
    macros: Program[],
    runProgram: Eval
): void {
    const op = declarationProgram.first.toText();
    const nameProgram = declarationProgram.rest.first;
    if (op === 'include') {
        parseInclude(
            nameProgram,
            namespace,
            functions,
            constants,
            macros,
            runProgram
        );
        return;
    }
    const name = nameProgram.toText();
    if (namespace.has(name)) {
        throw new Error(`Symbol ${JSON.stringify(name)} redefined.`);
    }
    namespace.add(name);
    if (op === 'defmacro') {
        macros.push(declarationProgram);
    } else if (op === 'defun') {
        functions[name] = declarationProgram.rest.rest;
    } else if (op === 'defun-inline') {
        macros.push(defunInlineToMacro(declarationProgram));
    } else if (op === 'defconstant') {
        constants[name] = quoteAsProgram(declarationProgram.rest.rest.first);
    } else {
        throw new Error(
            `Expected "defun", "defun-inline", "defmacro", or "defconstant", but got ${JSON.stringify(
                op
            )}.`
        );
    }
}

export function compileModStage1(
    args: Program,
    runProgram: Eval
): [functions: Group, constants: Group, macros: Program[]] {
    const functions: Group = {};
    const constants: Group = {};
    const macros: Array<Program> = [];
    const mainLocalArguments = args.first;
    const namespace = new BetterSet<string>();
    while (true) {
        args = args.rest;
        if (args.rest.isNull) break;
        parseModProgram(
            args.first,
            namespace,
            functions,
            constants,
            macros,
            runProgram
        );
    }
    const uncompiledMain = args.first;
    functions[mainName] = Program.fromList([
        mainLocalArguments,
        uncompiledMain,
    ]);
    return [functions, constants, macros];
}

export function symbolTableForTree(tree: Program, rootNode: NodePath): Program {
    if (tree.isNull) return Program.nil;
    else if (!tree.isCons)
        return Program.fromList([
            Program.fromList([tree, Program.fromBytes(rootNode.asPath())]),
        ]);
    const left = symbolTableForTree(tree.first, rootNode.add(NodePath.left));
    const right = symbolTableForTree(tree.rest, rootNode.add(NodePath.right));
    return Program.fromList([...left.toList(), ...right.toList()]);
}

export function buildMacroLookupProgram(
    macroLookup: Program,
    macros: Program[],
    runProgram: Eval
): Program {
    let macroLookupProgram = quoteAsProgram(macroLookup);
    for (const macro of macros) {
        macroLookupProgram = evalAsProgram(
            Program.fromList([
                Program.fromText('opt'),
                Program.fromList([
                    Program.fromText('com'),
                    quoteAsProgram(
                        Program.fromList([
                            Program.fromBytes(consAtom),
                            macro,
                            macroLookupProgram,
                        ])
                    ),
                    macroLookupProgram,
                ]),
            ]),
            Program.fromBytes(NodePath.top.asPath())
        );
        macroLookupProgram = optimizeProgram(macroLookupProgram, runProgram);
    }
    return macroLookupProgram;
}

export function compileFunctions(
    functions: Group,
    macroLookupProgram: Program,
    constantSymbolTable: Program,
    argsRootNode: NodePath
): Group {
    const compiledFunctions: Group = {};
    for (const [name, lambdaExpression] of Object.entries(functions)) {
        const localSymbolTable = symbolTableForTree(
            lambdaExpression.first,
            argsRootNode
        );
        const allSymbols = Program.fromList([
            ...localSymbolTable.toList(),
            ...constantSymbolTable.toList(),
        ]);
        compiledFunctions[name] = Program.fromList([
            Program.fromText('opt'),
            Program.fromList([
                Program.fromText('com'),
                quoteAsProgram(lambdaExpression.rest.first),
                macroLookupProgram,
                quoteAsProgram(allSymbols),
            ]),
        ]);
    }
    return compiledFunctions;
}

export function compileMod(
    args: Program,
    macroLookup: Program,
    _symbolTable: Program,
    runProgram: Eval
): Program {
    const [functions, constants, macros] = compileModStage1(args, runProgram);
    const macroLookupProgram = buildMacroLookupProgram(
        macroLookup,
        macros,
        runProgram
    );
    const allConstantNames = buildUsedConstantNames(
        functions,
        constants,
        macros
    );
    const hasConstantTree = allConstantNames.size > 0;
    const constantTree = buildTree([
        ...allConstantNames.map((item) => Program.fromText(item)),
    ]);
    const constantRootNode = NodePath.left;
    const argsRootNode = hasConstantTree ? NodePath.right : NodePath.top;
    const constantSymbolTable = symbolTableForTree(
        constantTree,
        constantRootNode
    );
    const compiledFunctions = compileFunctions(
        functions,
        macroLookupProgram,
        constantSymbolTable,
        argsRootNode
    );
    const mainPathSource = compiledFunctions[mainName].toString();
    let argTreeSource: string;
    if (hasConstantTree) {
        const allConstantsLookup: Group = {};
        for (const [key, value] of Object.entries(compiledFunctions))
            if (allConstantNames.has(key)) allConstantsLookup[key] = value;
        Object.assign(allConstantsLookup, constants);
        const allConstantsList = [...allConstantNames].map(
            (item) => allConstantsLookup[item]
        );
        const allConstantsTreeProgram = buildTreeProgram(allConstantsList);
        const allConstantsTreeSource = allConstantsTreeProgram.toString();
        argTreeSource = `(c ${allConstantsTreeSource} 1)`;
    } else {
        argTreeSource = '1';
    }
    return Program.fromSource(
        `(opt (q . (a ${mainPathSource} ${argTreeSource})))`
    );
}
