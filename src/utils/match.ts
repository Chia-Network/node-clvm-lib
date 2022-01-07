import { Program } from '../index.js';
import { Group } from './helpers.js';

const atomMatch = Buffer.from('$', 'utf-8');
const sexpMatch = Buffer.from(':', 'utf-8');

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
        return pattern.atom.equals(sexp.atom) ? knownBindings : null;
    }
    const left = pattern.first;
    const right = pattern.rest;
    if (left.isAtom && left.atom.equals(atomMatch)) {
        if (sexp.isCons) return null;
        if (right.isAtom && right.atom.equals(atomMatch)) {
            if (sexp.atom.equals(atomMatch)) return {};
            return null;
        }
        return unifyBindings(knownBindings, right.toText(), sexp);
    }
    if (left.isAtom && left.atom.equals(sexpMatch)) {
        if (right.isAtom && right.atom.equals(sexpMatch)) {
            if (sexp.atom.equals(sexpMatch)) return {};
            return null;
        }
        return unifyBindings(knownBindings, right.toText(), sexp);
    }
    if (!sexp.isCons) return null;
    const newBindings = match(left, sexp.first, knownBindings);
    if (!newBindings) return newBindings;
    return match(right, sexp.rest, newBindings);
}
