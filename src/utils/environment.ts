import { costs } from '../constants/costs';
import { Program, ProgramOutput } from '../types/Program';

export function msbMask(byte: number): number {
    byte |= byte >> 1;
    byte |= byte >> 2;
    byte |= byte >> 4;
    return (byte + 1) >> 1;
}

export function traversePath(
    value: Program,
    environment: Program
): ProgramOutput {
    let cost = costs.pathLookupBase + costs.pathLookupPerLeg;
    if (value.isNull) return { value: Program.nil, cost };
    let endByteCursor = 0;
    const atom = value.atom;
    while (endByteCursor < atom.length && atom[endByteCursor] === 0)
        endByteCursor++;
    cost += BigInt(endByteCursor) * costs.pathLookupPerZeroByte;
    if (endByteCursor === atom.length) return { value: Program.nil, cost };
    const endBitMask = msbMask(atom[endByteCursor]);
    let byteCursor = atom.length - 1;
    let bitMask = 0x01;
    while (byteCursor > endByteCursor || bitMask < endBitMask) {
        if (environment.isAtom)
            throw new Error(
                `Cannot traverse into ${environment}${environment.positionSuffix}.`
            );
        if ((atom[byteCursor] & bitMask) !== 0) environment = environment.rest;
        else environment = environment.first;
        cost += costs.pathLookupPerLeg;
        bitMask <<= 1;
        if (bitMask === 0x100) {
            byteCursor--;
            bitMask = 0x01;
        }
    }
    return { value: environment, cost };
}
