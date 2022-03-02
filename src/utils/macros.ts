import { Program } from '../index';
import { Eval } from './helpers';

const defaultMacroSources = [
    `
    ; we have to compile this externally, since it uses itself
    ;(defmacro defmacro (name params body)
    ;    (qq (list (unquote name) (mod (unquote params) (unquote body))))
    ;)
    (q . ("defmacro"
       (c (q . "list")
          (c (f 1)
             (c (c (q . "mod")
                   (c (f (r 1))
                      (c (f (r (r 1)))
                         (q . ()))))
                (q . ()))))))
    `,
    `
    ;(defmacro list ARGS
    ;    ((c (mod args
    ;        (defun compile-list
    ;               (args)
    ;               (if args
    ;                   (qq (c (unquote (f args))
    ;                         (unquote (compile-list (r args)))))
    ;                   ()))
    ;            (compile-list args)
    ;        )
    ;        ARGS
    ;    ))
    ;)
    (q "list"
        (a (q #a (q #a 2 (c 2 (c 3 (q))))
                 (c (q #a (i 5
                             (q #c (q . 4)
                                   (c 9 (c (a 2 (c 2 (c 13 (q))))
                                           (q)))
                             )
                             (q 1))
                           1)
                    1))
            1))
    `,
    `(defmacro function (BODY)
        (qq (opt (com (q . (unquote BODY))
                 (qq (unquote (macros)))
                 (qq (unquote (symbols)))))))`,
    `(defmacro if (A B C)
        (qq (a
            (i (unquote A)
               (function (unquote B))
               (function (unquote C)))
            @)))`,
    `(defmacro / (A B) (qq (f (divmod (unquote A) (unquote B)))))`,
];

let defaultMacroLookupProgram: Program | undefined;

function buildDefaultMacroLookup(evalAsProgram: Eval): Program {
    const run = Program.fromSource('(a (com 2 3) 1)');
    for (const macroSource of defaultMacroSources) {
        const macroProgram = Program.fromSource(macroSource);
        const env = Program.cons(macroProgram, defaultMacroLookupProgram!);
        const newMacro = evalAsProgram(run, env).value;
        defaultMacroLookupProgram = Program.cons(
            newMacro,
            defaultMacroLookupProgram!
        );
    }
    return defaultMacroLookupProgram!;
}

export function defaultMacroLookup(evalAsProgram: Eval): Program {
    if (!defaultMacroLookupProgram || defaultMacroLookupProgram.isNull) {
        defaultMacroLookupProgram = Program.fromList([]);
        buildDefaultMacroLookup(evalAsProgram);
    }
    return defaultMacroLookupProgram;
}
