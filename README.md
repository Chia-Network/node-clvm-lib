# CLVM

[![npm package](https://nodei.co/npm/clvm-lib.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/clvm-lib)

A browser friendly implementation of CLVM in TypeScript, based off of [the Chia Network implementation written in Python](https://github.com/Chia-Network/clvm).

## Introduction

[Chialisp](https://chialisp.com) is an on-chain smart coin programming language developed by the [Chia Network](https://chia.net). It is compiled and then executed by the Chialisp Virtual Machine, or CLVM for short.

This particular implementation is written with TypeScript, and is not bindings to native code. This allows it to be used in the browser as well. However, if you prefer native bindings, you should check out [this library](https://github.com/Chia-Network/clvm_rs) instead.

## Usage

You can learn more about how this language works [here](https://chialisp.com). This is a implementation and should work as expected, but in any case that it differs, please open an issue.

By design, the functions and methods exposed by this library are synchronous and everything is exported for ease of use.

Since it is written in TypeScript, there are built-in typings for IntelliSense. The following documentation is non-exhaustive, but should be enough for most uses.

## Documentation

-   [Program](#program)

## Value

Either `Cons` or `Uint8Array`.

## Cons

A tuple of `Program` and `Program`.

## Program

This represents a program or value in Chialisp or compiled clvm. It is the main class of the library, allowing you to manipulate programs and convert between various forms.

### static true

-   A program representing the value `1`.

### static false

-   A program representing the value `()`.

### atom

-   The `Uint8Array` value of the program.

### cons

-   The `Cons` pair of the program.

### first

-   The first `Program` value of `cons`.

### rest

-   The rest `Program` value of `cons`.

### isAtom

-   A `boolean` for if it's an atom.

### isCons

-   A `boolean` for if it's a cons pair.

### isNull

-   A `boolean` for if it's null.

### static cons(first, rest)

-   `first` is a `Program`.
-   `rest` is a `Program`.
-   Returns a `Program` that is a cons pair between them.

### static fromBytes(bytes)

-   `bytes` is a `Uint8Array`.
-   Returns a `Program`.

### static fromHex(hex)

-   `hex` is a hex `string`.
-   Returns a `Program`.

### static fromBool(value)

-   `value` is a `boolean`.
-   Returns a `Program`.

### static fromInt(value)

-   `value` is a `number`.
-   Returns a `Program`.

### static fromBigint(value)

-   `value` is a `bigint`.
-   Returns a `Program`.

### static fromText(text)

-   `text` is a `string`.
-   Returns a `Program`.

### static fromSource(source)

-   `source` is a `string`.
-   Returns a `Program`.

### static fromList(programs)

-   `programs` is an `Array<Program>`.
-   Returns a `Program`.

### static deserialize(bytes)

-   `bytes` is a `Uint8Array`.
-   Returns a `Program`.

### constructor(value)

-   `value` is a `Value`.

### positionSuffix

-   A `string` containing the line and column suffix, if there is one.

### at(position)

-   `position` is a `Position`.
-   Returns `this`.

### curry(args)

-   `args` is an `Array<Program>`.
-   Returns a `Program` containing the current one with each argument applied to it in reverse, precommitting them in the final solution.

### uncurry()

-   Returns a `[Program, Array<Program>]` containing the mod and curried in arguments.

### hash()

-   Returns a `Uint8Array` of the tree hash of the program. Hashed with `1` for atoms, and `2` for cons pairs.

### hashHex()

-   Returns a hex `string` representation of the tree hash.

### define(program)

-   Returns a `Program` containing the current one wrapped in a mod if there isn't already, and with a definition inserted.

### defineAll(programs)

-   `programs` is an `Array<Program>`.
-   Returns a `Program` containing the current one and each definition.

### compile(options?)

-   `options` is a partial `CompileOptions`, defaulting to `strict = false`, `operators = base`, and `includeFilePaths = {}`.
-   Returns a `ProgramOutput` that is the result of compiling the program. Should be identical to the `run` CLI tool.

### run(environment, options?)

-   `environment` is a `Program`.
-   `options` is a partial `RunOptions`, defaulting to `strict = false` and `operators = base`.
-   Returns a `ProgramOutput` that is the result of running the program. Should be identical to the `brun` CLI tool.

### toBytes()

-   Returns a `Uint8Array` representation.

### toHex()

-   Returns a hex `string` representation.

### toBool()

-   Returns a `boolean` representation.

### toInt()

-   Returns a `number` representation.

### toBigInt()

-   Returns a `bigint` representation.

### toText()

-   Returns a `string` representation.

### toSource(showKeywords?)

-   `showKeywords` is a `boolean`, by default `true`.
-   Returns a `string` source code representation, like it would be if it were an output from `run` or `brun`.

### toList(strict?)

-   `strict` is a `boolean`, by default `false`.
-   Returns an `Array<Program>` representation. If it's strict, it must be a proper list.

### serialize()

-   Returns a `Uint8Array` serialized form of the program.

### serializeHex()

-   Returns a hex `string` representation of the serialized form of the program.

### equals(value)

-   `value` is a `Program`.
-   Returns a `boolean` for if the values are exactly equal.

### toString()

-   Returns a `string` source code representation, like it would be if it were an output from `run` or `brun`.
