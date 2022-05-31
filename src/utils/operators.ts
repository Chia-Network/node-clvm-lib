import {
    bigIntToBytes,
    bytesEqual,
    bytesToBigInt,
    bytesToInt,
    defaultEc,
    hash256,
    JacobianPoint,
    mod,
    PrivateKey,
} from '@rigidity/bls-signatures';
import { costs } from '../constants/costs';
import { keywords } from '../constants/keywords';
import { Program, ProgramOutput, RunOptions } from '../types/Program';

export type Operator = (args: Program) => ProgramOutput;

export interface Operators {
    operators: Record<string, Operator>;
    unknown: (operator: Program, args: Program) => ProgramOutput;
    quote: string;
    apply: string;
}

export const operators = {
    i: ((args: Program): ProgramOutput => {
        const list = toList(args, 'i', 3);
        return { value: list[0].isNull ? list[2] : list[1], cost: costs.if };
    }) as Operator,
    c: ((args: Program): ProgramOutput => {
        const list = toList(args, 'c', 2);
        return { value: Program.cons(list[0], list[1]), cost: costs.cons };
    }) as Operator,
    f: ((args: Program): ProgramOutput => {
        const list = toList(args, 'f', 1, 'cons');
        return { value: list[0].first, cost: costs.first };
    }) as Operator,
    r: ((args: Program): ProgramOutput => {
        const list = toList(args, 'r', 1, 'cons');
        return { value: list[0].rest, cost: costs.rest };
    }) as Operator,
    l: ((args: Program): ProgramOutput => {
        const list = toList(args, 'l', 1);
        return { value: Program.fromBool(list[0].isCons), cost: costs.listp };
    }) as Operator,
    x: ((args: Program): ProgramOutput => {
        throw new Error(`The error ${args} was raised${args.positionSuffix}.`);
    }) as Operator,
    '=': ((args: Program): ProgramOutput => {
        const list = toList(args, '=', 2, 'atom');
        return {
            value: Program.fromBool(bytesEqual(list[0].atom, list[1].atom)),
            cost:
                costs.eqBase +
                (BigInt(list[0].atom.length) + BigInt(list[1].atom.length)) *
                    costs.eqPerByte,
        };
    }) as Operator,
    sha256: ((args: Program): ProgramOutput => {
        const list = toList(args, 'sha256', undefined, 'atom');
        let cost = costs.sha256Base;
        let argLength = 0;
        const bytes: Array<number> = [];
        for (const item of list) {
            for (const byte of item.atom) bytes.push(byte);
            argLength += item.atom.length;
            cost += costs.sha256PerArg;
        }
        cost += BigInt(argLength) * costs.sha256PerByte;
        return mallocCost({
            value: Program.fromBytes(hash256(Uint8Array.from(bytes))),
            cost,
        });
    }) as Operator,
    '+': ((args: Program): ProgramOutput => {
        const list = toList(args, '+', undefined, 'atom');
        let total = 0n;
        let cost = costs.arithBase;
        let argSize = 0;
        for (const item of list) {
            total += item.toBigInt();
            argSize += item.atom.length;
            cost += costs.arithPerArg;
        }
        cost += BigInt(argSize) * costs.arithPerByte;
        return mallocCost({ value: Program.fromBigInt(total), cost });
    }) as Operator,
    '-': ((args: Program): ProgramOutput => {
        let cost = costs.arithBase;
        if (args.isNull) return { value: Program.nil, cost: cost };
        const list = toList(args, '-', undefined, 'atom');
        let total = 0n;
        let sign = 1n;
        let argSize = 0;
        for (const item of list) {
            total += sign * item.toBigInt();
            sign = -1n;
            argSize += item.atom.length;
            cost += costs.arithPerArg;
        }
        cost += BigInt(argSize) * costs.arithPerByte;
        return mallocCost({ value: Program.fromBigInt(total), cost });
    }) as Operator,
    '*': ((args: Program): ProgramOutput => {
        const list = toList(args, '*', undefined, 'atom');
        let cost = costs.mulBase;
        if (!list.length) return mallocCost({ value: Program.true, cost });
        let value = list[0].toBigInt();
        let size = list[0].atom.length;
        for (const item of list.slice(1)) {
            cost +=
                costs.mulPerOp +
                (BigInt(item.atom.length) + BigInt(size)) *
                    costs.mulLinearPerByte +
                (BigInt(item.atom.length) * BigInt(size)) /
                    costs.mulSquarePerByteDivider;
            value *= item.toBigInt();
            size = limbsForBigInt(value);
        }
        return mallocCost({ value: Program.fromBigInt(value), cost });
    }) as Operator,
    divmod: ((args: Program): ProgramOutput => {
        const list = toList(args, 'divmod', 2, 'atom');
        let cost = costs.divmodBase;
        const numerator = list[0].toBigInt();
        const denominator = list[1].toBigInt();
        if (denominator === 0n)
            throw new Error(
                `Cannot divide by zero in "divmod" operator${args.positionSuffix}.`
            );
        cost +=
            (BigInt(list[0].atom.length) + BigInt(list[1].atom.length)) *
            costs.divmodPerByte;
        let quotientValue = numerator / denominator;
        const remainderValue = mod(numerator, denominator);
        if (numerator < 0n !== denominator < 0n && remainderValue !== 0n)
            quotientValue -= 1n;
        const quotient = Program.fromBigInt(quotientValue);
        const remainder = Program.fromBigInt(remainderValue);
        cost +=
            (BigInt(quotient.atom.length) + BigInt(remainder.atom.length)) *
            costs.mallocPerByte;
        return { value: Program.cons(quotient, remainder), cost };
    }) as Operator,
    '/': ((args: Program): ProgramOutput => {
        const list = toList(args, '/', 2, 'atom');
        let cost = costs.divBase;
        const numerator = list[0].toBigInt();
        const denominator = list[1].toBigInt();
        if (denominator === 0n)
            throw new Error(
                `Cannot divide by zero in "/" operator${args.positionSuffix}.`
            );
        cost +=
            (BigInt(list[0].atom.length) + BigInt(list[1].atom.length)) *
            costs.divPerByte;
        let quotientValue = numerator / denominator;
        const remainderValue = mod(numerator, denominator);
        if (numerator < 0n !== denominator < 0n && quotientValue < 0n)
            quotientValue -= 1n;
        const quotient = Program.fromBigInt(quotientValue);
        return mallocCost({ value: quotient, cost });
    }) as Operator,
    '>': ((args: Program): ProgramOutput => {
        const list = toList(args, '>', 2, 'atom');
        const cost =
            costs.grBase +
            (BigInt(list[0].atom.length) + BigInt(list[1].atom.length)) *
                costs.grPerByte;
        return {
            value: Program.fromBool(list[0].toBigInt() > list[1].toBigInt()),
            cost,
        };
    }) as Operator,
    '>s': ((args: Program): ProgramOutput => {
        const list = toList(args, '>s', 2, 'atom');
        const cost =
            costs.grsBase +
            (BigInt(list[0].atom.length) + BigInt(list[1].atom.length)) *
                costs.grsPerByte;
        return {
            value: Program.fromBool(
                list[0].toHex().localeCompare(list[1].toHex()) === 1
            ),
            cost,
        };
    }) as Operator,
    pubkey_for_exp: ((args: Program): ProgramOutput => {
        const list = toList(args, 'pubkey_for_exp', 1, 'atom');
        const value = mod(list[0].toBigInt(), defaultEc.n);
        const exponent = PrivateKey.fromBytes(bigIntToBytes(value, 32, 'big'));
        const cost =
            costs.pubkeyBase +
            BigInt(list[0].atom.length) * costs.pubkeyPerByte;
        return mallocCost({
            value: Program.fromBytes(exponent.getG1().toBytes()),
            cost,
        });
    }) as Operator,
    point_add: ((args: Program): ProgramOutput => {
        const list = toList(args, 'point_add', undefined, 'atom');
        let cost = costs.pointAddBase;
        let point = JacobianPoint.infinityG1();
        for (const item of list) {
            point = point.add(JacobianPoint.fromBytes(item.atom, false));
            cost += costs.pointAddPerArg;
        }
        return mallocCost({ value: Program.fromBytes(point.toBytes()), cost });
    }) as Operator,
    strlen: ((args: Program): ProgramOutput => {
        const list = toList(args, 'strlen', 1, 'atom');
        const size = list[0].atom.length;
        const cost = costs.strlenBase + BigInt(size) * costs.strlenPerByte;
        return mallocCost({ value: Program.fromInt(size), cost });
    }) as Operator,
    substr: ((args: Program): ProgramOutput => {
        const list = toList(args, 'substr', [2, 3], 'atom');
        const value = list[0].atom;
        if (
            list[1].atom.length > 4 ||
            (list.length === 3 && list[2].atom.length > 4)
        )
            throw new Error(
                `Expected 4 byte indices in "substr" operator${args.positionSuffix}.`
            );
        const from = list[1].toInt();
        const to = list.length === 3 ? list[2].toInt() : value.length;
        if (to > value.length || to < from || to < 0 || from < 0)
            throw new Error(
                `Invalid indices in "substr" operator${args.positionSuffix}.`
            );
        return { value: Program.fromBytes(value.slice(from, to)), cost: 1n };
    }) as Operator,
    concat: ((args: Program): ProgramOutput => {
        const list = toList(args, 'concat', undefined, 'atom');
        let cost = costs.concatBase;
        const bytes: Array<number> = [];
        for (const item of list) {
            for (const byte of item.atom) bytes.push(byte);
            cost += costs.concatPerArg;
        }
        cost += BigInt(bytes.length) * costs.concatPerByte;
        return mallocCost({
            value: Program.fromBytes(Uint8Array.from(bytes)),
            cost,
        });
    }) as Operator,
    ash: ((args: Program): ProgramOutput => {
        const list = toList(args, 'ash', 2, 'atom');
        if (list[1].atom.length > 4)
            throw new Error(
                `Shift must be 32 bits in "ash" operator${args.positionSuffix}.`
            );
        const shift = list[1].toBigInt();
        if ((shift < 0n ? -shift : shift) > 65535n)
            throw new Error(
                `Shift too large in "ash" operator${args.positionSuffix}.`
            );
        let value = list[0].toBigInt();
        if (shift >= 0) value <<= shift;
        else value >>= -shift;
        const cost =
            costs.ashiftBase +
            (BigInt(list[0].atom.length) + BigInt(limbsForBigInt(value))) *
                costs.ashiftPerByte;
        return mallocCost({ value: Program.fromBigInt(value), cost });
    }) as Operator,
    lsh: ((args: Program): ProgramOutput => {
        const list = toList(args, 'lsh', 2, 'atom');
        if (list[1].atom.length > 4)
            throw new Error(
                `Shift must be 32 bits in "lsh" operator${args.positionSuffix}.`
            );
        const shift = list[1].toBigInt();
        if ((shift < 0n ? -shift : shift) > 65535n)
            throw new Error(
                `Shift too large in "lsh" operator${args.positionSuffix}.`
            );
        let value = bytesToBigInt(list[0].atom, 'big', false);
        if (value < 0n) value = -value;
        if (shift >= 0) value <<= shift;
        else value >>= -shift;
        const cost =
            costs.lshiftBase +
            (BigInt(list[0].atom.length) + BigInt(limbsForBigInt(value))) *
                costs.lshiftPerByte;
        return mallocCost({ value: Program.fromBigInt(value), cost });
    }) as Operator,
    logand: ((args: Program): ProgramOutput =>
        binopReduction('logand', -1n, args, (a, b) => a & b)) as Operator,
    logior: ((args: Program): ProgramOutput =>
        binopReduction('logior', 0n, args, (a, b) => a | b)) as Operator,
    logxor: ((args: Program): ProgramOutput =>
        binopReduction('logxor', 0n, args, (a, b) => a ^ b)) as Operator,
    lognot: ((args: Program): ProgramOutput => {
        const items = toList(args, 'lognot', 1, 'atom');
        const cost =
            costs.lognotBase +
            BigInt(items[0].atom.length) * costs.lognotPerByte;
        return mallocCost({
            value: Program.fromBigInt(~items[0].toBigInt()),
            cost,
        });
    }) as Operator,
    not: ((args: Program): ProgramOutput => {
        const items = toList(args, 'not', 1);
        const cost = costs.boolBase;
        return { value: Program.fromBool(items[0].isNull), cost: cost };
    }) as Operator,
    any: ((args: Program): ProgramOutput => {
        const list = toList(args, 'any');
        const cost = costs.boolBase + BigInt(list.length) * costs.boolPerArg;
        let result = false;
        for (const item of list) {
            if (!item.isNull) {
                result = true;
                break;
            }
        }
        return { value: Program.fromBool(result), cost: cost };
    }) as Operator,
    all: ((args: Program): ProgramOutput => {
        const list = toList(args, 'all');
        const cost = costs.boolBase + BigInt(list.length) * costs.boolPerArg;
        let result = true;
        for (const item of list) {
            if (item.isNull) {
                result = false;
                break;
            }
        }
        return { value: Program.fromBool(result), cost: cost };
    }) as Operator,
    softfork: ((args: Program): ProgramOutput => {
        const list = toList(args, 'softfork', [1, Infinity]);
        if (!list[0].isAtom)
            throw new Error(
                `Expected atom argument in "softfork" operator at ${list[0].positionSuffix}.`
            );
        const cost = list[0].toBigInt();
        if (cost < 1n)
            throw new Error(
                `Cost must be greater than zero in "softfork" operator${args.positionSuffix}.`
            );
        return { value: Program.false, cost: cost };
    }) as Operator,
};

export const defaultOperators = {
    operators,
    unknown: defaultUnknownOperator,
    quote: 'q',
    apply: 'a',
};

export function makeDefaultOperators() {
    return {
        ...defaultOperators,
        operators: { ...defaultOperators.operators },
    };
}

export function toList(
    program: Program,
    name: string,
    length?: [number, number] | number,
    type?: 'atom' | 'cons'
): Program[] {
    const list = program.toList();
    if (typeof length === 'number' && list.length !== length)
        throw new Error(
            `Expected ${length} arguments in ${JSON.stringify(name)} operator${
                program.positionSuffix
            }.`
        );
    else if (
        Array.isArray(length) &&
        (list.length < length[0] || list.length > length[1])
    )
        throw new Error(
            `Expected ${
                length[1] === Infinity
                    ? `at least ${length[0]}`
                    : `between ${length[0]} and ${length[1]}`
            } arguments in ${JSON.stringify(name)} operator${
                program.positionSuffix
            }.`
        );
    if (type !== undefined)
        list.forEach((item) => {
            if (
                (type === 'atom' && !item.isAtom) ||
                (type === 'cons' && !item.isCons)
            )
                throw new Error(
                    `Expected ${type} argument in ${JSON.stringify(
                        name
                    )} operator${item.positionSuffix}.`
                );
        });
    return list;
}

export function limbsForBigInt(value: bigint): number {
    let length =
        value === 0n ? 0 : (value < 0n ? -value : value).toString(2).length;
    if (value < 0n) length++;
    return (length + 7) >> 3;
}

export function mallocCost(output: ProgramOutput): ProgramOutput {
    return {
        value: output.value,
        cost:
            output.cost +
            BigInt(output.value.atom.length) * costs.mallocPerByte,
    };
}

export function binopReduction(
    opName: string,
    initialValue: bigint,
    args: Program,
    opFunction: (a: bigint, b: bigint) => bigint
): ProgramOutput {
    let total = initialValue;
    let argSize = 0;
    let cost = costs.logBase;
    for (const item of args.toList().map((item) => {
        if (!item.isAtom)
            throw new Error(
                `Expected atom argument in ${JSON.stringify(opName)} operator${
                    item.positionSuffix
                }.`
            );
        return item;
    })) {
        total = opFunction(total, item.toBigInt());
        argSize += item.atom.length;
        cost += costs.logPerArg;
    }
    cost += BigInt(argSize) * costs.logPerByte;
    return mallocCost({ value: Program.fromBigInt(total), cost });
}

export function defaultUnknownOperator(
    op: Program,
    args: Program
): ProgramOutput {
    if (
        !op.atom.length ||
        bytesEqual(op.atom.slice(0, 2), Uint8Array.from([0xff, 0xff]))
    )
        throw new Error(`Reserved operator${op.positionSuffix}.`);
    if (op.atom.length > 5)
        throw new Error(`Invalid operator${op.positionSuffix}.`);
    const costFunction = (op.atom[op.atom.length - 1] & 0xc0) >> 6;
    const costMultiplier =
        bytesToInt(op.atom.slice(0, op.atom.length - 1), 'big') + 1;
    let cost: bigint;
    if (costFunction === 0) cost = 1n;
    else if (costFunction === 1) {
        cost = costs.arithBase;
        let argSize = 0;
        for (const item of args.toList()) {
            if (!item.isAtom)
                throw new Error(
                    `Expected atom argument${item.positionSuffix}.`
                );
            argSize += item.atom.length;
            cost += costs.arithPerArg;
        }
        cost += BigInt(argSize) * costs.arithPerByte;
    } else if (costFunction === 2) {
        cost = costs.mulBase;
        const argList = args.toList();
        if (argList.length) {
            const first = argList[0];
            if (!first.isAtom)
                throw new Error(
                    `Expected atom argument${first.positionSuffix}.`
                );
            let current = first.atom.length;
            for (const item of argList.slice(1)) {
                if (!item.isAtom)
                    throw new Error(
                        `Expected atom argument${item.positionSuffix}.`
                    );
                cost +=
                    costs.mulPerOp +
                    (BigInt(item.atom.length) + BigInt(current)) *
                        costs.mulLinearPerByte +
                    (BigInt(item.atom.length) * BigInt(current)) /
                        costs.mulSquarePerByteDivider;
                current += item.atom.length;
            }
        }
    } else if (costFunction === 3) {
        cost = costs.concatBase;
        let length = 0;
        for (const item of args.toList()) {
            if (!item.isAtom)
                throw new Error(
                    `Expected atom argument${item.positionSuffix}.`
                );
            cost += costs.concatPerArg;
            length += item.atom.length;
        }
        cost += BigInt(length) * costs.concatPerByte;
    } else throw new Error(`Unknown cost function${op.positionSuffix}.`);
    cost *= BigInt(costMultiplier);
    if (cost >= 2n ** 32n)
        throw new Error(`Invalid operator${op.positionSuffix}.`);
    return { value: Program.nil, cost: cost };
}

export function runOperator(
    op: Program,
    args: Program,
    options: RunOptions
): ProgramOutput {
    const symbol = op.toBigInt();
    const keyword =
        Object.entries(keywords).find((entry) => entry[1] === symbol)?.[0] ??
        op.toText();
    if (keyword in options.operators.operators) {
        const result = options.operators.operators[keyword](args);
        return result;
    } else return options.operators.unknown(op, args);
}
