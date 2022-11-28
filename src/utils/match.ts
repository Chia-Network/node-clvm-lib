import { bytesEqual } from 'chia-bls';
import { Program } from '../index';
import { Group } from './helpers';

const atomMatch = new TextEncoder().encode('$');
const sexpMatch = new TextEncoder().encode(':');

export function unifyBindings(
    bindings: Group,
    key: string,
    valueProgram: Program
): Group | null {
    if (key in bindings) {
        if (!bindings[key].equals(valueProgram)) return null;
        return bindings;
    }
    return { ...bindings, [key]: valueProgram };
}

export function match(
    pattern: Program,
    sexp: Program,
    knownBindings: Group = {}
): Group | null {
    if (!pattern.isCons) {
        if (sexp.isCons) return null;
        return bytesEqual(pattern.atom, sexp.atom) ? knownBindings : null;
    }
    const left = pattern.first;
    const right = pattern.rest;
    if (left.isAtom && bytesEqual(left.atom, atomMatch)) {
        if (sexp.isCons) return null;
        if (right.isAtom && bytesEqual(right.atom, atomMatch)) {
            if (bytesEqual(sexp.atom, atomMatch)) return {};
            return null;
        }
        return unifyBindings(knownBindings, right.toText(), sexp);
    }
    if (left.isAtom && bytesEqual(left.atom, sexpMatch)) {
        if (right.isAtom && bytesEqual(right.atom, sexpMatch)) {
            if (bytesEqual(sexp.atom, sexpMatch)) return {};
            return null;
        }
        return unifyBindings(knownBindings, right.toText(), sexp);
    }
    if (!sexp.isCons) return null;
    const newBindings = match(left, sexp.first, knownBindings);
    if (!newBindings) return newBindings;
    return match(right, sexp.rest, newBindings);
}
