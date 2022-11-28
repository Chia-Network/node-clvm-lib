import { bytesEqual, encodeBigInt, toHex } from 'chia-bls';
import { applyAtom, consAtom, quoteAtom } from '../constants/atoms';
import { keywords } from '../constants/keywords';
import { BetterSet } from '../types/BetterSet';
import { NodePath } from '../types/NodePath';
import { Program, ProgramOutput } from '../types/Program';
import { brunAsProgram, Eval, evalAsProgram, quoteAsProgram } from './helpers';
import { defaultMacroLookup } from './macros';
import { compileMod } from './mod';
import { Operator } from './operators';

const passThroughOperators = new BetterSet([
    ...Object.values(keywords).map((value) => toHex(encodeBigInt(value))),
    toHex(new TextEncoder().encode('com')),
    toHex(new TextEncoder().encode('opt')),
]);

export function compileQq(
    args: Program,
    macroLookup: Program,
    symbolTable: Program,
    runProgram: Eval,
    level: number = 1
): Program {
    function com(program: Program): Program {
        return doComProgram(program, macroLookup, symbolTable, runProgram);
    }

    const program = args.first;
    if (!program.isCons) {
        return quoteAsProgram(program);
    }
    if (!program.first.isCons) {
        const op = program.first.toText();
        if (op === 'qq') {
            const expression = compileQq(
                program.rest,
                macroLookup,
                symbolTable,
                runProgram,
                level + 1
            );
            return com(
                Program.fromList([
                    Program.fromBytes(consAtom),
                    Program.fromText(op),
                    Program.fromList([
                        Program.fromBytes(consAtom),
                        expression,
                        quoteAsProgram(Program.nil),
                    ]),
                ])
            );
        } else if (op === 'unquote') {
            if (level === 1) {
                return com(program.rest.first);
            }
            const expression = compileQq(
                program.rest,
                macroLookup,
                symbolTable,
                runProgram,
                level - 1
            );
            return com(
                Program.fromList([
                    Program.fromBytes(consAtom),
                    Program.fromText(op),
                    Program.fromList([
                        Program.fromBytes(consAtom),
                        expression,
                        quoteAsProgram(Program.nil),
                    ]),
                ])
            );
        }
    }
    const first = com(
        Program.fromList([Program.fromText('qq'), program.first])
    );
    const rest = com(Program.fromList([Program.fromText('qq'), program.rest]));
    return Program.fromList([Program.fromBytes(consAtom), first, rest]);
}

export function compileMacros(
    _args: Program,
    macroLookup: Program,
    _symbolTable: Program,
    _runProgram: Eval
): Program {
    return quoteAsProgram(macroLookup);
}

export function compileSymbols(
    _args: Program,
    _macroLookup: Program,
    symbolTable: Program,
    _runProgram: Eval
): Program {
    return quoteAsProgram(symbolTable);
}

export const compileBindings = {
    qq: compileQq,
    macros: compileMacros,
    symbols: compileSymbols,
    lambda: compileMod,
    mod: compileMod,
};

export function lowerQuote(
    program: Program,
    _macroLookup?: Program,
    _symbolTable?: Program,
    _runProgram?: Eval
): Program {
    if (program.isAtom) {
        return program;
    } else if (program.first.isAtom && program.first.toText() === 'quote') {
        if (!program.rest.rest.isNull)
            throw new Error(
                `Compilation error while compiling ${program}. Quote takes exactly one argument${program.positionSuffix}.`
            );
        return quoteAsProgram(lowerQuote(program.rest.first));
    } else
        return Program.cons(
            lowerQuote(program.first),
            lowerQuote(program.rest)
        );
}

export function doComProgram(
    program: Program,
    macroLookup: Program,
    symbolTable: Program,
    runProgram: Eval
): Program {
    program = lowerQuote(program, macroLookup, symbolTable, runProgram);
    if (!program.isCons) {
        const atom = program.toText();
        if (atom === '@') {
            return Program.fromBytes(NodePath.top.asPath());
        }
        for (const pair of symbolTable.toList()) {
            const symbol = pair.first;
            const value = pair.rest.first;
            if (symbol.isAtom && symbol.toText() === atom) {
                return value;
            }
        }
        return quoteAsProgram(program);
    }
    const operator = program.first;
    if (operator.isCons) {
        const inner = evalAsProgram(
            Program.fromList([
                Program.fromText('com'),
                quoteAsProgram(operator),
                quoteAsProgram(macroLookup),
                quoteAsProgram(symbolTable),
            ]),
            Program.fromBytes(NodePath.top.asPath())
        );
        return Program.fromList([inner]);
    }
    const atom = operator.toText();
    for (const macroPair of macroLookup.toList()) {
        if (macroPair.first.isAtom && macroPair.first.toText() === atom) {
            const macroCode = macroPair.rest.first;
            const postProgram = brunAsProgram(macroCode, program.rest);
            const result = evalAsProgram(
                Program.fromList([
                    Program.fromText('com'),
                    postProgram,
                    quoteAsProgram(macroLookup),
                    quoteAsProgram(symbolTable),
                ]),
                Program.fromBytes(NodePath.top.asPath())
            );
            return result;
        }
    }
    if (atom in compileBindings) {
        const compiler = compileBindings[atom as keyof typeof compileBindings];
        const postProgram = compiler(
            program.rest,
            macroLookup,
            symbolTable,
            runProgram
        );
        return evalAsProgram(
            quoteAsProgram(postProgram),
            Program.fromBytes(NodePath.top.asPath())
        );
    }
    if (bytesEqual(operator.atom, quoteAtom)) {
        return program;
    }
    const compiledArgs = program.rest
        .toList()
        .map((item) =>
            doComProgram(item, macroLookup, symbolTable, runProgram)
        );
    let result = Program.fromList([operator, ...compiledArgs]);
    if (
        passThroughOperators.has(toHex(new TextEncoder().encode(atom))) ||
        atom.startsWith('_')
    ) {
        return result;
    }
    for (const item of symbolTable.toList()) {
        const [symbol, value] = item.toList();
        if (!symbol.isAtom) continue;
        const symbolText = symbol.toText();
        if (symbolText === '*') {
            return result;
        } else if (symbolText === atom) {
            const newArgs = evalAsProgram(
                Program.fromList([
                    Program.fromText('opt'),
                    Program.fromList([
                        Program.fromText('com'),
                        quoteAsProgram(
                            Program.fromList([
                                Program.fromText('list'),
                                ...program.rest.toList(),
                            ])
                        ),
                        quoteAsProgram(macroLookup),
                        quoteAsProgram(symbolTable),
                    ]),
                ]),
                Program.fromBytes(NodePath.top.asPath())
            );
            return Program.fromList([
                Program.fromBytes(applyAtom),
                value,
                Program.fromList([
                    Program.fromBytes(consAtom),
                    Program.fromBytes(NodePath.left.asPath()),
                    newArgs,
                ]),
            ]);
        }
    }
    throw new Error(
        `Can't compile unknown operator ${program}${program.positionSuffix}.`
    );
}

export function makeDoCom(runProgram: Eval): Operator {
    return (sexp: Program): ProgramOutput => {
        const prog = sexp.first;
        let symbolTable = Program.nil;
        let macroLookup: Program;
        if (!sexp.rest.isNull) {
            macroLookup = sexp.rest.first;
            if (!sexp.rest.rest.isNull) symbolTable = sexp.rest.rest.first;
        } else {
            macroLookup = defaultMacroLookup(runProgram);
        }
        return {
            value: doComProgram(prog, macroLookup, symbolTable, runProgram),
            cost: 1n,
        };
    };
}
