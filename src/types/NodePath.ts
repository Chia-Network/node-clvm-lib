import {
    bigIntBitLength,
    bigIntToBytes,
    bytesToBigInt,
} from '@rigidity/bls-signatures';

export function composePaths(left: bigint, right: bigint): bigint {
    let mask = 1n;
    let tempPath = left;
    while (tempPath > 1n) {
        right <<= 1n;
        mask <<= 1n;
        tempPath >>= 1n;
    }
    mask -= 1n;
    return right | (left & mask);
}

export class NodePath {
    public static top: NodePath = new NodePath();
    public static left: NodePath = NodePath.top.first();
    public static right: NodePath = NodePath.top.rest();

    private index: bigint;

    constructor(index: bigint = 1n) {
        if (index < 0n) {
            const byteCount = (bigIntBitLength(index) + 7) >> 3;
            const blob = bigIntToBytes(index, byteCount, 'big', true);
            index = bytesToBigInt(Buffer.from([0, ...blob]), 'big', false);
        }
        this.index = index;
    }

    public asPath(): Buffer {
        const byteCount = (bigIntBitLength(this.index) + 7) >> 3;
        return bigIntToBytes(this.index, byteCount, 'big');
    }

    public add(other: NodePath): NodePath {
        return new NodePath(composePaths(this.index, other.index));
    }

    public first(): NodePath {
        return new NodePath(this.index * 2n);
    }

    public rest(): NodePath {
        return new NodePath(this.index * 2n + 1n);
    }

    public toString(): string {
        return `NodePath: ${this.index}`;
    }
}
