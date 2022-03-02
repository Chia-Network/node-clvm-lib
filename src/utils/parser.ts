import { keywords } from '../constants/keywords';
import { ParserError } from '../types/ParserError';
import { Position } from '../types/Position';
import { Program } from '../types/Program';
import { Token } from '../types/Token';

export function next(tokens: Token[]): Token | undefined {
    tokens.shift();
    return tokens[0];
}

export function expect(source: string, tokens: Token[]): void {
    const token = tokens[0];
    if (!next(tokens))
        throw new ParserError(
            `Unexpected end of source at ${new Position(source, token.index)}.`
        );
}

export function isSpace(char: string): boolean {
    return /^[\u0020\u202F\u205F\u2028\u2029\u3000\u0085\u1680\u00A0\u2000-\u200A\u0009-\u000D\u001C-\u001F]$/.test(
        char
    );
}

export function consumeWhitespace(text: string, index: number): number {
    while (true) {
        while (index < text.length && isSpace(text[index])) index++;
        if (index >= text.length || text[index] !== ';') break;
        while (index < text.length && !'\n\r'.includes(text[index])) index++;
    }
    return index;
}

export function consumeUntilWhitespace(text: string, index: number): Token {
    const start = index;
    while (index < text.length && !isSpace(text[index]) && text[index] !== ')')
        index++;
    return { text: text.slice(start, index), index };
}

export function tokenizeCons(source: string, tokens: Token[]): Program {
    let token = tokens[0];
    if (token.text === ')')
        return Program.fromBytes(Uint8Array.from([])).at(
            new Position(source, token.index)
        );
    const consStart = token.index;
    const first = tokenizeExpr(source, tokens);
    expect(source, tokens);
    token = tokens[0];
    let rest: Program;
    if (token.text === '.') {
        const dotStart = token.index;
        expect(source, tokens);
        token = tokens[0];
        rest = tokenizeExpr(source, tokens);
        expect(source, tokens);
        token = tokens[0];
        if (token.text !== ')')
            throw new ParserError(
                `Illegal dot expression at ${new Position(source, dotStart)}.`
            );
    } else rest = tokenizeCons(source, tokens);
    return Program.cons(first, rest).at(new Position(source, consStart));
}

export function tokenizeInt(source: string, token: Token): Program | null {
    return /^[+\-]?[0-9]+(?:_[0-9]+)*$/.test(token.text)
        ? Program.fromBigInt(BigInt(token.text.replaceAll('_', ''))).at(
              new Position(source, token.index)
          )
        : null;
}

export function tokenizeHex(source: string, token: Token): Program | null {
    if (
        token.text.length >= 2 &&
        token.text.slice(0, 2).toLowerCase() === '0x'
    ) {
        let hex = token.text.slice(2);
        if (hex.length % 2 === 1) hex = `0${hex}`;
        try {
            return Program.fromHex(hex).at(new Position(source, token.index));
        } catch (e) {
            throw new ParserError(
                `Invalid hex ${JSON.stringify(token.text)} at ${new Position(
                    source,
                    token.index
                )}.`
            );
        }
    } else return null;
}

export function tokenizeQuotes(source: string, token: Token): Program | null {
    if (token.text.length < 2) return null;
    const quote = token.text[0];
    if (!'"\''.includes(quote)) return null;
    if (token.text[token.text.length - 1] !== quote)
        throw new ParserError(
            `Unterminated string ${JSON.stringify(
                token.text
            )} at ${new Position(source, token.index)}.`
        );
    return Program.fromText(token.text.slice(1, token.text.length - 1)).at(
        new Position(source, token.index)
    );
}

export function tokenizeSymbol(source: string, token: Token): Program | null {
    let text = token.text;
    if (text.startsWith('#')) text = text.slice(1);
    const keyword: bigint | undefined = keywords[text as keyof typeof keywords];
    return (
        keyword === undefined
            ? Program.fromText(text)
            : Program.fromBigInt(keyword)
    ).at(new Position(source, token.index));
}

export function tokenizeExpr(source: string, tokens: Token[]): Program {
    const token = tokens[0];
    if (token.text === '(') {
        expect(source, tokens);
        return tokenizeCons(source, tokens);
    }
    const result =
        tokenizeInt(source, token) ??
        tokenizeHex(source, token) ??
        tokenizeQuotes(source, token) ??
        tokenizeSymbol(source, token);
    if (!result)
        throw new ParserError(
            `Invalid expression ${JSON.stringify(token.text)} at ${new Position(
                source,
                token.index
            )}.`
        );
    return result;
}

export function* tokenStream(source: string): IterableIterator<Token> {
    let index = 0;
    while (index < source.length) {
        index = consumeWhitespace(source, index);
        if (index >= source.length) break;
        const char = source[index];
        if ('(.)'.includes(char)) {
            yield { text: char, index };
            index++;
            continue;
        }
        if ('"\''.includes(char)) {
            const start = index;
            const quote = source[index];
            index++;
            while (index < source.length && source[index] !== quote) index++;
            if (index < source.length) {
                yield { text: source.slice(start, index + 1), index: start };
                index++;
                continue;
            } else
                throw new ParserError(
                    `Unterminated string at ${new Position(source, index)}.`
                );
        }
        const token = consumeUntilWhitespace(source, index);
        yield { text: token.text, index };
        index = token.index;
    }
}
