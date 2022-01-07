import fs from 'fs';
import { Program, ProgramOutput } from '../index.js';

export function doRead(args: Program): ProgramOutput {
    const fileName = args.first.toText();
    const source = fs.readFileSync(fileName, 'utf-8');
    return { value: Program.fromSource(source), cost: 1n };
}

export function doWrite(args: Program): ProgramOutput {
    const fileName = args.first.toText();
    const data = args.rest.first;
    fs.writeFileSync(fileName, data.toSource(), 'utf-8');
    return { value: Program.nil, cost: 1n };
}
