import { encodeBigInt } from '@rigidity/bls-signatures';
import { keywords } from './keywords.js';

export const quoteAtom = encodeBigInt(keywords['q']);
export const applyAtom = encodeBigInt(keywords['a']);
export const firstAtom = encodeBigInt(keywords['f']);
export const restAtom = encodeBigInt(keywords['r']);
export const consAtom = encodeBigInt(keywords['c']);
export const raiseAtom = encodeBigInt(keywords['x']);
