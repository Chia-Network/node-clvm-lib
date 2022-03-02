import { assert, expect } from 'chai';
import { Program } from '../src';

type CompileInput = [puzzle: string, cost?: bigint, strict?: boolean];

type CompileOutput = [
    output: string,
    cost?: bigint,
    dump?: boolean,
    showKeywords?: boolean
];

const compileTests: Map<CompileInput, CompileOutput | null> = new Map();

compileTests.set(['()'], ['()']);
compileTests.set(['(list 100 200 300)'], ['(100 200 300)']);
compileTests.set(['(if 1 100 200)'], ['100']);
compileTests.set(['(/ 5 2)'], ['2']);
compileTests.set(['(mod args (f args))'], ['2']);
compileTests.set(
    [
        '(mod () (defun factorial (number) (if (> number 2) (* number (factorial (- number 1))) number)) (factorial 5))',
    ],
    ['(q . 120)']
);
compileTests.set(
    ['(mod () (defconstant something "Hello") something)'],
    ['(q . "Hello")']
);
compileTests.set(
    ['(mod () (defun-inline mul (left right) (* left right)) (mul 5 10))'],
    ['(q . 50)']
);
compileTests.set(
    ['(mod () (defmacro mul (left right) (* left right)) (mul 5 10))'],
    ['(q . 50)', 29n]
);

describe('Compile', () => {
    for (const [input, output] of compileTests.entries()) {
        const puzzle = input[0];
        it(puzzle, () => {
            const cost = input[1];
            const strict = input[2];
            if (output === null) {
                expect(() =>
                    Program.fromSource(puzzle).compile({
                        maxCost: cost,
                        strict,
                    })
                ).to.throw();
            } else {
                const puzzleProgram = Program.fromSource(puzzle);
                const result = puzzleProgram.compile({
                    maxCost: cost,
                    strict,
                });
                const text =
                    output[2] ?? false
                        ? result.value.serializeHex()
                        : result.value.toSource(output[3]);
                assert.equal(text, output[0], 'Wrong output.');
                if (output[1] !== undefined)
                    assert.equal(result.cost, output[1] + 182n, 'Wrong cost.');
            }
        });
    }
});
