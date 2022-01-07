import {
    concatBytes,
    decodeBigInt,
    decodeInt,
    encodeBigInt,
    encodeInt,
} from '@rigidity/bls-signatures';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { keywords } from '../constants/keywords.js';
import { printable } from '../constants/printable.js';
import { makeDefaultOperators, Operators } from '../index.js';
import { makeDoCom } from '../utils/compile.js';
import { instructions } from '../utils/instructions.js';
import { deserialize } from '../utils/ir.js';
import { makeDoOpt } from '../utils/optimize.js';
import { tokenizeExpr, tokenStream } from '../utils/parser.js';
import { doRead, doWrite } from '../utils/run.js';
import { ParserError } from './ParserError.js';
import { Position } from './Position.js';

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
    includePaths: string[];
    include: Program[];
}

export type Cons = [Program, Program];
export type Value = Cons | Buffer;

export type Instruction = (
    instructions: Instruction[],
    stack: Program[],
    options: RunOptions
) => bigint;

export class Program {
    public static cost = 11000000000;
    public static true = Program.fromBytes(Buffer.from([1]));
    public static false = Program.fromBytes(Buffer.from([]));
    public static nil = Program.false;

    private value: Value;
    public position?: Position;

    public get atom(): Buffer {
        if (!this.isAtom)
            throw new Error(`Expected atom${this.positionSuffix}.`);
        return this.value as Buffer;
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
        return this.value instanceof Buffer;
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

    public static fromBytes(bytes: Buffer): Program {
        return new Program(bytes);
    }

    public static fromHex(hex: string): Program {
        return new Program(Buffer.from(hex, 'hex'));
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
        return new Program(Buffer.from(text, 'utf-8'));
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

    public static deserialize(bytes: Buffer): Program {
        const program = [...bytes];
        if (!program.length) throw new ParserError('Unexpected end of source.');
        return deserialize(program);
    }

    public static deserializeHex(hex: string): Program {
        return Program.deserialize(Buffer.from(hex, 'hex'));
    }

    private constructor(value: Value) {
        this.value = value;
    }

    public get positionSuffix(): string {
        return this.position ? ` at ${this.position}` : '';
    }

    public at(position: Position): this {
        this.position = position;
        return this;
    }

    public curry(...args: Program[]): Program {
        let current = Program.fromBigInt(keywords.q);
        for (const argument of args.reverse()) {
            current = Program.cons(
                Program.fromBigInt(keywords.c),
                Program.cons(
                    Program.cons(Program.fromBigInt(keywords.q), argument),
                    Program.cons(current, Program.nil)
                )
            );
        }
        return Program.fromSource(
            `(a (q . ${this.toString()}) ${current.toString()})`
        );
    }

    public hash(): Buffer {
        return this.isAtom
            ? createHash('sha256')
                  .update(concatBytes(Buffer.from([1]), this.atom))
                  .digest()
            : createHash('sha256')
                  .update(
                      concatBytes(
                          Buffer.from([2]),
                          this.first.hash(),
                          this.rest.hash()
                      )
                  )
                  .digest();
    }

    public hashHex(): string {
        return this.hash().toString('hex');
    }

    public compile(options: Partial<CompileOptions> = {}): ProgramOutput {
        const fullOptions: CompileOptions = {
            strict: false,
            operators: makeDefaultOperators(),
            includePaths: [],
            include: [],
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
            for (const searchPath of fullOptions.includePaths) {
                const filePath = path.join(searchPath, fileName);
                const stats = fs.statSync(filePath);
                if (stats.isFile())
                    return {
                        value: Program.fromText(filePath),
                        cost: 1n,
                    };
            }
            throw new Error(`Can't open ${fileName}${args.positionSuffix}.`);
        }
        function runProgram(program: Program, args: Program): ProgramOutput {
            return program.run(args, fullOptions);
        }
        const bindings = {
            com: makeDoCom(runProgram, fullOptions),
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

    public toBytes(): Buffer {
        if (this.isCons)
            throw new Error(
                `Cannot convert ${this.toString()} to hex${
                    this.positionSuffix
                }.`
            );
        return this.atom;
    }

    public toHex(): string {
        if (this.isCons)
            throw new Error(
                `Cannot convert ${this.toString()} to hex${
                    this.positionSuffix
                }.`
            );
        return this.value.toString('hex');
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
        return this.value.toString('utf-8');
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
            } else if (encodeInt(decodeInt(this.atom)).equals(this.atom))
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

    public serialize(): Buffer {
        if (this.isAtom) {
            if (this.isNull) return Buffer.from([0x80]);
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
                return Buffer.from(result);
            }
        } else {
            const result = [0xff];
            for (const byte of this.first.serialize()) result.push(byte);
            for (const byte of this.rest.serialize()) result.push(byte);
            return Buffer.from(result);
        }
    }

    public serializeHex(): string {
        return this.serialize().toString('hex');
    }

    public equals(value: Program): boolean {
        return (
            this.isAtom === value.isAtom &&
            (this.isAtom
                ? this.atom.equals(value.atom)
                : this.first.equals(value.first) &&
                  this.rest.equals(value.rest))
        );
    }

    public toString(): string {
        return this.toSource();
    }
}
