import { encodeBigInt } from '@rigidity/bls-signatures';
import { costs } from '../constants/cost.js';
import { keywords } from '../constants/keywords.js';
import { Instruction, Program } from '../types/Program.js';
import { traversePath } from './environment.js';
import { runOperator } from './operators.js';

export const instructions = {
    swap: ((_instructionStack, stack, _options) => {
        const second = stack.pop()!;
        const first = stack.pop()!;
        stack.push(second, first);
        return 0n;
    }) as Instruction,
    cons: ((_instructionStack, stack, _options) => {
        const first = stack.pop()!;
        const second = stack.pop()!;
        stack.push(Program.cons(first, second));
        return 0n;
    }) as Instruction,
    eval: ((instructionStack, stack, _options) => {
        const pair = stack.pop()!;
        const program = pair.first;
        const args = pair.rest;
        if (program.isAtom) {
            const output = traversePath(program, args);
            stack.push(output[0]);
            return output[1];
        }
        const op = program.first;
        if (op.isCons) {
            const newOperator = op.first;
            const mustBeNil = op.rest;
            if (newOperator.isCons || !mustBeNil.isNull)
                throw new Error(
                    `Operators that are lists must contain a single atom${op.positionSuffix}.`
                );
            const newOperandList = program.rest;
            stack.push(newOperator, newOperandList);
            instructionStack.push(instructions.apply);
            return costs.apply;
        }
        let operandList = program.rest;
        if (op.atom.equals(encodeBigInt(keywords.q))) {
            stack.push(operandList);
            return costs.quote;
        }
        instructionStack.push(instructions.apply);
        stack.push(op);
        while (!operandList.isNull) {
            stack.push(Program.cons(operandList.first, args));
            instructionStack.push(
                instructions.cons,
                instructions.eval,
                instructions.swap
            );
            operandList = operandList.rest;
        }
        stack.push(Program.nil);
        return 1n;
    }) as Instruction,
    apply: ((instructionStack, stack, options) => {
        const operandList = stack.pop()!;
        const op = stack.pop()!;
        if (op.isCons)
            throw new Error(`An internal error occurred${op.positionSuffix}.`);
        if (op.atom.equals(encodeBigInt(keywords.a))) {
            const args = operandList.toList();
            if (args.length !== 2)
                throw new Error(
                    `Expected 2 arguments in "a" operator${operandList.positionSuffix}.`
                );
            stack.push(Program.cons(args[0], args[1]));
            instructionStack.push(instructions.eval);
            return costs.apply;
        }
        const output = runOperator(op, operandList, options);
        stack.push(output[0]);
        return output[1];
    }) as Instruction,
};
