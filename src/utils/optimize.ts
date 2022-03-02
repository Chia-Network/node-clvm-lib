import { bytesEqual } from '@rigidity/bls-signatures';
import { quoteAtom, raiseAtom } from '../constants/atoms';
import { keywords, Program } from '../index';
import { NodePath } from '../types/NodePath';
import { Eval, quoteAsProgram } from './helpers';
import { match } from './match';
import { Operator } from './operators';

export function seemsConstant(program: Program): boolean {
    if (!program.isCons) return program.isNull;
    const operator = program.first;
    if (!operator.isCons) {
        const value = operator.atom;
        if (bytesEqual(value, quoteAtom)) return true;
        else if (bytesEqual(value, raiseAtom)) return false;
    } else if (!seemsConstant(operator)) return false;
    return program.rest.toList().every((item) => seemsConstant(item));
}

export function constantOptimizer(
    program: Program,
    evalAsProgram: Eval
): Program {
    if (seemsConstant(program) && !program.isNull) {
        const newProgram = evalAsProgram(program, Program.nil).value;
        program = quoteAsProgram(newProgram);
    }
    return program;
}

export function isArgsCall(program: Program): boolean {
    return program.isAtom && program.toBigInt() === 1n;
}

export function consQuoteApplyOptimizer(
    program: Program,
    _evalAsProgram: Eval
): Program {
    const matched = match(
        Program.fromSource('(a (q . (: . sexp)) (: . args))'),
        program
    );
    if (matched && isArgsCall(matched['args'])) {
        return matched['sexp'];
    }
    return program;
}

export function consFirst(args: Program): Program {
    const matched = match(
        Program.fromSource('(c (: . first) (: . rest))'),
        args
    );
    if (matched) {
        return matched['first'];
    }
    return Program.fromList([Program.fromBigInt(keywords['f']), args]);
}

export function consRest(args: Program): Program {
    const matched = match(
        Program.fromSource('(c (: . first) (: . rest))'),
        args
    );
    if (matched) {
        return matched['rest'];
    }
    return Program.fromList([Program.fromBigInt(keywords['r']), args]);
}

export function pathFromArgs(program: Program, args: Program): Program {
    const value = program.toBigInt();
    if (value <= 1n) {
        return args;
    }
    program = Program.fromBigInt(value >> 1n);
    if (value & 1n) {
        return pathFromArgs(program, consRest(args));
    }
    return pathFromArgs(program, consFirst(args));
}

export function subArgs(program: Program, args: Program): Program {
    if (!program.isCons) {
        return pathFromArgs(program, args);
    }
    let first = program.first;
    if (first.isCons) first = subArgs(first, args);
    else if (bytesEqual(first.atom, quoteAtom)) {
        return program;
    }
    return Program.fromList([
        first,
        ...program.rest.toList().map((item) => subArgs(item, args)),
    ]);
}

export function varChangeOptimizerConsEval(
    program: Program,
    evalAsProgram: Eval
): Program {
    const matched = match(
        Program.fromSource('(a (q . (: . sexp)) (: . args))'),
        program
    );
    if (!matched) {
        return program;
    }
    const originalArgs = matched['args'];
    const originalCall = matched['sexp'];
    const newEvalProgramArgs = subArgs(originalCall, originalArgs);
    if (seemsConstant(newEvalProgramArgs)) {
        return optimizeProgram(newEvalProgramArgs, evalAsProgram);
    }
    const newOperands = newEvalProgramArgs.toList();
    const optOperands = newOperands.map((item) =>
        optimizeProgram(item, evalAsProgram)
    );
    const nonConstantCount = optOperands.filter(
        (item) =>
            item.isCons &&
            (item.first.isCons || !bytesEqual(item.first.atom, quoteAtom))
    ).length;
    if (nonConstantCount < 1) {
        return Program.fromList(optOperands);
    }
    return program;
}

export function childrenOptimizer(
    program: Program,
    evalAsProgram: Eval
): Program {
    if (!program.isCons) {
        return program;
    }
    const operator = program.first;
    if (operator.isAtom && bytesEqual(operator.atom, quoteAtom)) {
        return program;
    }
    return Program.fromList(
        program.toList().map((item) => optimizeProgram(item, evalAsProgram))
    );
}

export function consOptimizer(program: Program, _evalAsProgram: Eval): Program {
    let matched = match(
        Program.fromSource('(f (c (: . first) (: . rest)))'),
        program
    );
    if (matched) {
        return matched['first'];
    }
    matched = match(
        Program.fromSource('(r (c (: . first) (: . rest)))'),
        program
    );
    if (matched) {
        return matched['rest'];
    }
    return program;
}

export function pathOptimizer(program: Program, _evalAsProgram: Eval): Program {
    let matched = match(Program.fromSource('(f ($ . atom))'), program);
    if (matched && !matched['atom'].isNull) {
        const node = new NodePath(matched['atom'].toBigInt()).add(
            NodePath.left
        );
        return Program.fromBytes(node.asPath());
    }
    matched = match(Program.fromSource('(r ($ . atom))'), program);
    if (matched && !matched['atom'].isNull) {
        const node = new NodePath(matched['atom'].toBigInt()).add(
            NodePath.right
        );
        return Program.fromBytes(node.asPath());
    }
    return program;
}

export function quoteNullOptimizer(
    program: Program,
    _evalAsProgram: Eval
): Program {
    const matched = match(Program.fromSource('(q . 0)'), program);
    if (matched) {
        return Program.nil;
    }
    return program;
}

export function applyNullOptimizer(
    program: Program,
    _evalAsProgram: Eval
): Program {
    const matched = match(Program.fromSource('(a 0 . (: . rest))'), program);
    if (matched) {
        return Program.nil;
    }
    return program;
}

export function optimizeProgram(
    program: Program,
    evalAsProgram: Eval
): Program {
    if (program.isAtom) {
        return program;
    }
    const optimizers = [
        consOptimizer,
        constantOptimizer,
        consQuoteApplyOptimizer,
        varChangeOptimizerConsEval,
        childrenOptimizer,
        pathOptimizer,
        quoteNullOptimizer,
        applyNullOptimizer,
    ];
    while (program.isCons) {
        const startProgram = program;
        for (const optimizer of optimizers) {
            program = optimizer(program, evalAsProgram);
            if (!startProgram.equals(program)) break;
        }
        if (startProgram.equals(program)) {
            return program;
        }
    }
    return program;
}

export function makeDoOpt(runProgram: Eval): Operator {
    return (args) => {
        return {
            value: optimizeProgram(args.first, runProgram),
            cost: 1n,
        };
    };
}
