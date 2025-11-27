# Typesafe CSV

![NPM Version](https://img.shields.io/npm/v/%40akiroz%2Ftypesafe-csv)

An opinionated typesafe CSV serialization library for arbitarary objects leverging [Papaparse][] and [Zod][]

## Getting Started

CsvSerializer takes a column schema in the form of `[CSV Header, Object Keypath, ZodType]`

Zod 4.1's [codec][] feature can be used to control serialization of non-string types where:
- decode: CSV -> Object
- encode: Object -> CSV

```ts
import { z } from 'zod';
import { CsvSerializer } from '@akiroz/typesafe-csv';

const serializer = new CsvSerializer([
    ['ID', 'id', z.string().min(1)],
    ['Status', 'status', z.enum(['active', 'inactive']).optional()],
    ['Is Admin', 'isAdmin', z.stringbool().optional()],
    [
        'Created At',
        'meta.createdAt',
        z
            .codec(z.string(), z.date(), {
                decode: (s) => new Date(s),
                encode: (d) => d.toISOString().split('T')[0],
            })
            .optional(),
    ],
    [
        'Score',
        'meta.scores.primary',
        z
            .codec(z.string().regex(/^\d+$/), z.number().int(), {
                decode: (s) => Number(s),
                encode: (n) => String(n),
            })
            .optional(),
    ],
] as const);

const data = [
    {
        id: '201',
        status: 'inactive' as const,
        isAdmin: false,
        meta: {
            createdAt: new Date('2023-12-25'),
            scores: { primary: 100 },
        },
    },
    {
        id: '202',
        // status is undefined
        isAdmin: true,
        meta: {
            createdAt: new Date('2024-01-01'),
            scores: { primary: 50 },
        },
    },
];

const csvStr = serializer.export(data);

const data2 = serializer.import(csvStr);
```

| ID  | Status   | Is Admin | Created At | Score |
|-----|----------|----------|------------|-------|
| 201 | inactive | false    | 2023-12-25 | 100   |
| 202 |          | true     | 2024-01-01 | 50    |

Empty values in CSV are converted to `undefined` and nullish JS values are serialized to an empty cell.

`.import()` automatically infers type information from the schema:

<img src="img/screenshot_1.png" width="1000">

## CSV Serialization Config

This library is simply a wrapper around [Papaparse][], the constructor takes a 2nd argument where Papaparse config can be specified:

```ts
const tsvSerializer = new CsvSerializer([/* ... */], {
    parse: {
        delimiter: '\t'
    },
    unparse: {
        delimiter: '\t'
    }
});
```

[Papaparse]: https://www.papaparse.com/
[Zod]: https://zod.dev/
[codec]: https://zod.dev/codecs