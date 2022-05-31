import { keywords } from '../constants/keywords';
import { NodePath } from '../types/NodePath';
import { Program, ProgramOutput } from '../types/Program';

export type Eval = (program: Program, args: Program) => ProgramOutput;
export type Group = Record<string, Program>;

export function quoteAsProgram(program: Program): Program {
    return Program.cons(Program.fromBigInt(keywords['q']), program);
}

export function evalAsProgram(program: Program, args: Program): Program {
    return Program.fromList([Program.fromBigInt(keywords['a']), program, args]);
}

export function runAsProgram(program: Program, macroLookup: Program): Program {
    return evalAsProgram(
        Program.fromList([
            Program.fromText('com'),
            program,
            quoteAsProgram(macroLookup),
        ]),
        Program.fromBytes(NodePath.top.asPath())
    );
}

export function brunAsProgram(program: Program, args: Program): Program {
    return evalAsProgram(quoteAsProgram(program), quoteAsProgram(args));
}
