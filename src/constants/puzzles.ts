import fs from 'fs';
import path from 'path';

export const includePath = path.resolve(__dirname, '..', '..', '..', 'include');

export const conditionCodes = fs.readFileSync(
    path.join(includePath, 'condition_codes.clib'),
    'utf-8'
);

export const curryAndTreeHash = fs.readFileSync(
    path.join(includePath, 'curry_and_treehash.clib'),
    'utf-8'
);

export const sha256tree = fs.readFileSync(
    path.join(includePath, 'sha256tree.clib'),
    'utf-8'
);

export const singletonTruths = fs.readFileSync(
    path.join(includePath, 'singleton_truths.clib'),
    'utf-8'
);

export const utilityMacros = fs.readFileSync(
    path.join(includePath, 'utility_macros.clib'),
    'utf-8'
);
