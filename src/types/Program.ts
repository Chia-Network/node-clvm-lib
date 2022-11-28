import {
    bytesEqual,
    concatBytes,
    decodeBigInt,
    decodeInt,
    encodeBigInt,
    encodeInt,
    fromHex,
    hash256,
    JacobianPoint,
    PrivateKey,
    toHex,
} from 'chia-bls';
import { keywords } from '../constants/keywords';
import { printable } from '../constants/printable';
import { makeDoCom } from '../utils/compile';
import { instructions } from '../utils/instructions';
import { deserialize } from '../utils/ir';
import { match } from '../utils/match';
import { makeDefaultOperators, Operators } from '../utils/operators';
import { makeDoOpt } from '../utils/optimize';
import { tokenizeExpr, tokenStream } from '../utils/parser';
import { ParserError } from './ParserError';
import { Position } from './Position';

export interface ProgramOutput {
    value: Program;
    cost: bigint;
}

export interface RunOptions {
    maxCost?: bigint;
    operators: Operators;
    strict: boolean;
}

export interface CompileOptions extends RunOptions {
    includeFilePaths: Record<string, Record<string, string>>;
}

export type Cons = [Program, Program];
export type Value = Cons | Uint8Array;

export type Instruction = (
    instructions: Instruction[],
    stack: Program[],
    options: RunOptions
) => bigint;

export class Program {
    public static cost = 11000000000;
    public static true = Program.fromBytes(Uint8Array.from([1]));
    public static false = Program.fromBytes(Uint8Array.from([]));
    public static nil = Program.false;

    public readonly value: Value;
    public position?: Position;

    public get atom(): Uint8Array {
        if (!this.isAtom)
            throw new Error(`Expected atom${this.positionSuffix}.`);
        return this.value as Uint8Array;
    }

    public get cons(): Cons {
        if (!this.isCons)
            throw new Error(`Expected cons${this.positionSuffix}.`);
        return this.value as Cons;
    }

    public get first(): Program {
        return this.cons[0];
    }

    public get rest(): Program {
        return this.cons[1];
    }

    public get isAtom() {
        return this.value instanceof Uint8Array;
    }

    public get isCons() {
        return Array.isArray(this.value);
    }

    public get isNull(): boolean {
        return this.isAtom && this.value.length === 0;
    }

    public static cons(first: Program, rest: Program): Program {
        return new Program([first, rest]);
    }

    public static fromBytes(bytes: Uint8Array): Program {
        return new Program(bytes);
    }

    public static fromJacobianPoint(jacobianPoint: JacobianPoint): Program {
        return new Program(jacobianPoint.toBytes());
    }

    public static fromPrivateKey(privateKey: PrivateKey): Program {
        return new Program(privateKey.toBytes());
    }

    public static fromHex(hex: string): Program {
        return new Program(fromHex(hex));
    }

    public static fromBool(value: boolean): Program {
        return value ? Program.true : Program.false;
    }

    public static fromInt(value: number): Program {
        return new Program(encodeInt(value));
    }

    public static fromBigInt(value: bigint): Program {
        return new Program(encodeBigInt(value));
    }

    public static fromText(text: string): Program {
        return new Program(new TextEncoder().encode(text));
    }

    public static fromSource(source: string): Program {
        const stream = tokenStream(source);
        const tokens = [...stream];
        if (tokens.length) return tokenizeExpr(source, tokens);
        else throw new ParserError('Unexpected end of source.');
    }

    public static fromList(programs: Program[]): Program {
        let result = Program.nil;
        for (const program of programs.reverse())
            result = Program.cons(program, result);
        return result;
    }

    public static deserialize(bytes: Uint8Array): Program {
        const program = [...bytes];
        if (!program.length) throw new ParserError('Unexpected end of source.');
        return deserialize(program);
    }

    public static deserializeHex(hex: string): Program {
        return Program.deserialize(fromHex(hex));
    }

    constructor(value: Value) {
        this.value = value;
    }

    public get positionSuffix(): string {
        return this.position ? ` at ${this.position}` : '';
    }

    public at(position: Position): this {
        this.position = position;
        return this;
    }

    public curry(args: Program[]): Program {
        return Program.fromSource(
            '(a (q #a 4 (c 2 (c 5 (c 7 0)))) (c (q (c (q . 2) (c (c (q . 1) 5) (c (a 6 (c 2 (c 11 (q 1)))) 0))) #a (i 5 (q 4 (q . 4) (c (c (q . 1) 9) (c (a 6 (c 2 (c 13 (c 11 0)))) 0))) (q . 11)) 1) 1))'
        ).run(Program.cons(this, Program.fromList(args))).value;
    }

    public uncurry(): [Program, Program[]] | null {
        const uncurryPatternFunction = Program.fromSource(
            '(a (q . (: . function)) (: . core))'
        );
        const uncurryPatternCore = Program.fromSource(
            '(c (q . (: . parm)) (: . core))'
        );

        let result = match(uncurryPatternFunction, this);
        if (!result) return null;

        const fn = result.function;
        let core = result.core;

        const args: Array<Program> = [];

        while (true) {
            result = match(uncurryPatternCore, core);
            if (!result) break;

            args.push(result.parm);
            core = result.core;
        }

        if (core.isAtom && core.toBigInt() === 1n) return [fn, args];
        return null;
    }

    public hash(): Uint8Array {
        return this.isAtom
            ? hash256(concatBytes(Uint8Array.from([1]), this.atom))
            : hash256(
                  concatBytes(
                      Uint8Array.from([2]),
                      this.first.hash(),
                      this.rest.hash()
                  )
              );
    }

    public hashHex(): string {
        return toHex(this.hash());
    }

    public define(program: Program): Program {
        let result: Program = this;
        if (this.isAtom || this.first.isCons || this.first.toText() !== 'mod')
            result = Program.fromList([
                Program.fromText('mod'),
                Program.nil,
                this,
            ]);
        const items = result.toList();
        items.splice(2, 0, program);
        return Program.fromList(items);
    }

    public defineAll(programs: Program[]): Program {
        let result: Program = this;
        for (const program of programs.reverse())
            result = result.define(program);
        return result;
    }

    public compile(options: Partial<CompileOptions> = {}): ProgramOutput {
        const fullOptions: CompileOptions = {
            strict: false,
            operators: makeDefaultOperators(),
            includeFilePaths: {},
            ...options,
        };
        if (fullOptions.strict)
            fullOptions.operators.unknown = (_operator, args) => {
                throw new Error(
                    `Unimplemented operator${args.positionSuffix}.`
                );
            };
        function doFullPathForName(args: Program): ProgramOutput {
            const fileName = args.first.toText();
            for (const [path, files] of Object.entries(
                fullOptions.includeFilePaths
            )) {
                if (fileName in files)
                    return {
                        value: Program.fromText(`${path}/${fileName}`),
                        cost: 1n,
                    };
            }
            throw new Error(`Can't open ${fileName}${args.positionSuffix}.`);
        }
        function doRead(args: Program): ProgramOutput {
            const fileName = args.first.toText();
            let source: string | null = null;
            for (const [path, files] of Object.entries(
                fullOptions.includeFilePaths
            )) {
                for (const [file, content] of Object.entries(files)) {
                    if (fileName === `${path}/${file}`) source = content;
                }
            }
            if (source === null)
                throw new Error(
                    `Can't open ${fileName}${args.positionSuffix}.`
                );
            return { value: Program.fromSource(source), cost: 1n };
        }
        // Not functional, due to browser support. May reimplement later.
        function doWrite(_args: Program): ProgramOutput {
            return { value: Program.nil, cost: 1n };
        }

        function runProgram(program: Program, args: Program): ProgramOutput {
            return program.run(args, fullOptions);
        }
        const bindings = {
            com: makeDoCom(runProgram),
            opt: makeDoOpt(runProgram),
            _full_path_for_name: doFullPathForName,
            _read: doRead,
            _write: doWrite,
        };
        Object.assign(fullOptions.operators.operators, bindings);
        return runProgram(
            Program.fromSource('(a (opt (com 2)) 3)'),
            Program.fromList([this])
        );
    }

    public run(
        environment: Program,
        options: Partial<RunOptions> = {}
    ): ProgramOutput {
        const fullOptions: RunOptions = {
            strict: false,
            operators: makeDefaultOperators(),
            ...options,
        };
        if (fullOptions.strict)
            fullOptions.operators.unknown = (_operator, args) => {
                throw new Error(
                    `Unimplemented operator${args.positionSuffix}.`
                );
            };
        const instructionStack: Array<Instruction> = [instructions.eval];
        const stack: Array<Program> = [Program.cons(this, environment)];
        let cost = 0n;
        while (instructionStack.length) {
            const instruction = instructionStack.pop()!;
            cost += instruction(instructionStack, stack, fullOptions);
            if (fullOptions.maxCost !== undefined && cost > fullOptions.maxCost)
                throw new Error(
                    `Exceeded cost of ${fullOptions.maxCost}${
                        stack[stack.length - 1].positionSuffix
                    }.`
                );
        }
        return {
            value: stack[stack.length - 1],
            cost,
        };
    }

    public toBytes(): Uint8Array {
        if (this.isCons)
            throw new Error(
                `Cannot convert ${this.toString()} to hex${
                    this.positionSuffix
                }.`
            );
        return this.atom;
    }

    public toJacobianPoint(): JacobianPoint {
        if (this.isCons || (this.atom.length !== 48 && this.atom.length !== 96))
            throw new Error(
                `Cannot convert ${this.toString()} to JacobianPoint${
                    this.positionSuffix
                }.`
            );
        return this.atom.length === 48
            ? JacobianPoint.fromBytesG1(this.atom)
            : JacobianPoint.fromBytesG2(this.atom);
    }

    public toPrivateKey(): PrivateKey {
        if (this.isCons)
            throw new Error(
                `Cannot convert ${this.toString()} to private key${
                    this.positionSuffix
                }.`
            );
        return PrivateKey.fromBytes(this.atom);
    }

    public toHex(): string {
        if (this.isCons)
            throw new Error(
                `Cannot convert ${this.toString()} to hex${
                    this.positionSuffix
                }.`
            );
        return toHex(this.atom);
    }

    public toBool(): boolean {
        if (this.isCons)
            throw new Error(
                `Cannot convert ${this.toString()} to bool${
                    this.positionSuffix
                }.`
            );
        return !this.isNull;
    }

    public toInt(): number {
        if (this.isCons)
            throw new Error(
                `Cannot convert ${this.toString()} to int${
                    this.positionSuffix
                }.`
            );
        return decodeInt(this.atom);
    }

    public toBigInt(): bigint {
        if (this.isCons)
            throw new Error(
                `Cannot convert ${this.toString()} to bigint${
                    this.positionSuffix
                }.`
            );
        return decodeBigInt(this.atom);
    }

    public toText(): string {
        if (this.isCons)
            throw new Error(
                `Cannot convert ${this.toString()} to text${
                    this.positionSuffix
                }.`
            );
        return new TextDecoder().decode(this.atom);
    }

    public toSource(showKeywords: boolean = true): string {
        if (this.isAtom) {
            if (this.isNull) return '()';
            else if (this.value.length > 2) {
                try {
                    const string = this.toText();
                    for (let i = 0; i < string.length; i++) {
                        if (!printable.includes(string[i]))
                            return `0x${this.toHex()}`;
                    }
                    if (string.includes('"') && string.includes("'"))
                        return `0x${this.toHex()}`;
                    const quote = string.includes('"') ? "'" : '"';
                    return quote + string + quote;
                } catch {
                    return `0x${this.toHex()}`;
                }
            } else if (bytesEqual(encodeInt(decodeInt(this.atom)), this.atom))
                return decodeInt(this.atom).toString();
            else return `0x${this.toHex()}`;
        } else {
            let result = '(';
            if (showKeywords && this.first.isAtom) {
                const value = this.first.toBigInt();
                const keyword = Object.keys(keywords).find(
                    (keyword) =>
                        keywords[keyword as keyof typeof keywords] === value
                );
                result += keyword ? keyword : this.first.toSource(showKeywords);
            } else result += this.first.toSource(showKeywords);
            let current = this.cons[1];
            while (current.isCons) {
                result += ` ${current.first.toSource(showKeywords)}`;
                current = current.cons[1];
            }
            result +=
                (current.isNull ? '' : ` . ${current.toSource(showKeywords)}`) +
                ')';
            return result;
        }
    }

    public toList(strict: boolean = false): Program[] {
        const result: Array<Program> = [];
        let current: Program = this;
        while (current.isCons) {
            const item = current.first;
            result.push(item);
            current = current.rest;
        }
        if (!current.isNull && strict)
            throw new Error(`Expected strict list${this.positionSuffix}.`);
        return result;
    }

    public serialize(): Uint8Array {
        if (this.isAtom) {
            if (this.isNull) return Uint8Array.from([0x80]);
            else if (this.atom.length === 1 && this.atom[0] <= 0x7f)
                return this.atom;
            else {
                const size = this.atom.length;
                const result: Array<number> = [];
                if (size < 0x40) result.push(0x80 | size);
                else if (size < 0x2000) {
                    result.push(0xc0 | (size >> 8));
                    result.push((size >> 0) & 0xff);
                } else if (size < 0x100000) {
                    result.push(0xe0 | (size >> 16));
                    result.push((size >> 8) & 0xff);
                    result.push((size >> 0) & 0xff);
                } else if (size < 0x8000000) {
                    result.push(0xf0 | (size >> 24));
                    result.push((size >> 16) & 0xff);
                    result.push((size >> 8) & 0xff);
                    result.push((size >> 0) & 0xff);
                } else if (size < 0x400000000) {
                    result.push(0xf8 | (size >> 32));
                    result.push((size >> 24) & 0xff);
                    result.push((size >> 16) & 0xff);
                    result.push((size >> 8) & 0xff);
                    result.push((size >> 0) & 0xff);
                } else
                    throw new RangeError(
                        `Cannot serialize ${this.toString()} as it is 17,179,869,184 or more bytes in size${
                            this.positionSuffix
                        }.`
                    );
                for (const byte of this.atom) result.push(byte);
                return Uint8Array.from(result);
            }
        } else {
            const result = [0xff];
            for (const byte of this.first.serialize()) result.push(byte);
            for (const byte of this.rest.serialize()) result.push(byte);
            return Uint8Array.from(result);
        }
    }

    public serializeHex(): string {
        return toHex(this.serialize());
    }

    public equals(value: Program): boolean {
        return (
            this.isAtom === value.isAtom &&
            (this.isAtom
                ? bytesEqual(this.atom, value.atom)
                : this.first.equals(value.first) &&
                  this.rest.equals(value.rest))
        );
    }

    public toString(): string {
        return this.toSource();
    }
}
