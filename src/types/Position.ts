export class Position {
    public line: number;
    public column: number;

    constructor(source: string, index: number) {
        source = source.replaceAll('\r\n', '\n');
        let line = 1;
        let column = 1;
        for (let i = 0; i < index; i++) {
            if (source[i] === '\n') {
                line++;
                column = 1;
            } else {
                column++;
            }
        }
        this.line = line;
        this.column = column;
    }

    public toString(): string {
        return `${this.line}:${this.column}`;
    }
}
