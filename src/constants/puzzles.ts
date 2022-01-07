import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..', '..', 'include');

export const conditionCodes = fs.readFileSync(
    path.join(root, 'condition_codes.clib'),
    'utf-8'
);

export const curryAndTreeHash = fs.readFileSync(
    path.join(root, 'curry_and_treehash.clib'),
    'utf-8'
);

export const sha256tree = fs.readFileSync(
    path.join(root, 'sha256tree.clib'),
    'utf-8'
);

export const singletonTruths = fs.readFileSync(
    path.join(root, 'singleton_truths.clib'),
    'utf-8'
);

export const utilityMacros = fs.readFileSync(
    path.join(root, 'utility_macros.clib'),
    'utf-8'
);
