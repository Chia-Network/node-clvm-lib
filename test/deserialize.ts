import { assert, expect } from 'chai';
import { Program } from '../src/index.js';

const deserializeTests: Map<string, string | null> = new Map();

deserializeTests.set('80', '()');
deserializeTests.set('ff0101', '(q . 1)');
deserializeTests.set('ff01ff0180', '(q 1)');
deserializeTests.set('01', '1');
deserializeTests.set('85ffffabcdef', '0xffffabcdef');
deserializeTests.set('86616263646566', '"abcdef"');
deserializeTests.set(
    'ff05ffff04ffff0114ffff011e8080',
    '(f (c (q . 20) (q . 30)))'
);
deserializeTests.set(
    'ff10ffbd200888489af9569930925255368b25e27749a2c3a5d54a31d90d45629b2e29348d5be73f72bf489e71df64000000000000000000000000000000000000ff8f13426172c74d822b878fe80000000080',
    '(+ 0x200888489af9569930925255368b25e27749a2c3a5d54a31d90d45629b2e29348d5be73f72bf489e71df64000000000000000000000000000000000000 0x13426172c74d822b878fe800000000)'
);
deserializeTests.set(
    'c04a4ad5c0c0203e6553d723e4e9c6861ec58934a33f237330d166d7e5b490595f999c5ae6a01836e022ecbe7b489f0584841ef8c7bb88ec9b6c63d8d9d4459c142a42632ae01a6022f08b57',
    '0x4ad5c0c0203e6553d723e4e9c6861ec58934a33f237330d166d7e5b490595f999c5ae6a01836e022ecbe7b489f0584841ef8c7bb88ec9b6c63d8d9d4459c142a42632ae01a6022f08b57'
);
deserializeTests.set('ffffffff8080808080', '((((()))))');

describe('Deserialize', () => {
    for (const [input, output] of deserializeTests.entries()) {
        it(input, () => {
            if (output === null) {
                expect(() => Program.deserializeHex(input)).to.throw();
            } else {
                const puzzleProgram = Program.deserializeHex(input);
                assert.equal(puzzleProgram.toSource(), output, 'Wrong output.');
            }
        });
    }
});
