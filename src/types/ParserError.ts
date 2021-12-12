export class ParserError extends Error {
    constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, ParserError.prototype);
    }
}
