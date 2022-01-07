import { assert, expect } from 'chai';
import { Program } from '../src/index.js';

const serializeTests: Map<string, string | null> = new Map();

serializeTests.set('()', '80');
serializeTests.set('(q . 1)', 'ff0101');
serializeTests.set('(q . (q . ()))', 'ff01ff0180');
serializeTests.set('1', '01');
serializeTests.set('0xffffabcdef', '85ffffabcdef');
serializeTests.set('"abcdef"', '86616263646566');
serializeTests.set(
    '(f (c (q . 20) (q . 30)))',
    'ff05ffff04ffff0114ffff011e8080'
);
serializeTests.set(
    '(+ 100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000 100000000000000000000000000000000000))',
    'ff10ffbd200888489af9569930925255368b25e27749a2c3a5d54a31d90d45629b2e29348d5be73f72bf489e71df64000000000000000000000000000000000000ff8f13426172c74d822b878fe80000000080'
);
serializeTests.set(
    '4738294723897492387408293747389479823749238749832748932748923745987326478623874623784679283747823649832756782374732864823764872364873264832764738264873648273648723648273649273687',
    'c04a4ad5c0c0203e6553d723e4e9c6861ec58934a33f237330d166d7e5b490595f999c5ae6a01836e022ecbe7b489f0584841ef8c7bb88ec9b6c63d8d9d4459c142a42632ae01a6022f08b57'
);
serializeTests.set('((((()))))', 'ffffffff8080808080');

describe('Serialize', () => {
    for (const [input, output] of serializeTests.entries()) {
        it(input, () => {
            if (output === null) {
                expect(() => {
                    const puzzleProgram = Program.fromSource(input);
                    puzzleProgram.serialize();
                }).to.throw();
            } else {
                const puzzleProgram = Program.fromSource(input);
                assert.equal(
                    puzzleProgram.serializeHex(),
                    output,
                    'Wrong output.'
                );
            }
        });
    }
});
