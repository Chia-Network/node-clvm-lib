import { decodeInt } from 'chia-bls';
import { ParserError } from '../types/ParserError';
import { Program } from '../types/Program';

export function deserialize(program: number[]): Program {
    const sizeBytes: Array<number> = [];
    if (program[0] <= 0x7f)
        return Program.fromBytes(Uint8Array.from([program[0]]));
    else if (program[0] <= 0xbf) sizeBytes.push(program[0] & 0x3f);
    else if (program[0] <= 0xdf) {
        sizeBytes.push(program[0] & 0x1f);
        program.shift();
        if (!program.length)
            throw new ParserError('Expected next byte in source.');
        sizeBytes.push(program[0]);
    } else if (program[0] <= 0xef) {
        sizeBytes.push(program[0] & 0x0f);
        for (let i = 0; i < 2; i++) {
            program.shift();
            if (!program.length)
                throw new ParserError('Expected next byte in source.');
            sizeBytes.push(program[0]);
        }
    } else if (program[0] <= 0xf7) {
        sizeBytes.push(program[0] & 0x07);
        for (let i = 0; i < 3; i++) {
            program.shift();
            if (!program.length)
                throw new ParserError('Expected next byte in source.');
            sizeBytes.push(program[0]);
        }
    } else if (program[0] <= 0xfb) {
        sizeBytes.push(program[0] & 0x03);
        for (let i = 0; i < 4; i++) {
            program.shift();
            if (!program.length)
                throw new ParserError('Expected next byte in source.');
            sizeBytes.push(program[0]);
        }
    } else if (program[0] === 0xff) {
        program.shift();
        if (!program.length)
            throw new ParserError('Expected next byte in source.');
        const first = deserialize(program);
        program.shift();
        if (!program.length)
            throw new ParserError('Expected next byte in source.');
        const rest = deserialize(program);
        return Program.cons(first, rest);
    } else throw new ParserError('Invalid encoding.');
    const size = decodeInt(Uint8Array.from(sizeBytes));
    let bytes: Array<number> = [];
    for (let i = 0; i < size; i++) {
        program.shift();
        if (!program.length) {
            throw new ParserError('Expected next byte in atom.');
        }
        bytes.push(program[0]);
    }
    return Program.fromBytes(Uint8Array.from(bytes));
}
