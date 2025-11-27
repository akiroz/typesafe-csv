import dlv from 'dlv';
import { dset } from 'dset';
import Papa from 'papaparse';
import { type ZodType, z } from 'zod';

type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

type MetaEntry<KP extends string, ZT extends ZodType> = readonly [string, KP, ZT];

type Split<S extends string, D extends string> = S extends `${infer T}${D}${infer U}` ? [T, ...Split<U, D>] : [S];

type DeepObjectFromKeys<K extends string[], V> = K extends [infer Head extends string, ...infer Tail extends string[]]
    ? undefined extends V
        ? { [key in Head]?: DeepObjectFromKeys<Tail, V> }
        : { [key in Head]: DeepObjectFromKeys<Tail, V> }
    : V;

type OutputObject<S extends MetaEntry<string, ZodType>[]> = {
    [I in keyof S]: S[I] extends MetaEntry<infer KP, infer ZT>
        ? DeepObjectFromKeys<Split<KP, '.'>, z.output<ZT>>
        : never;
}[number] extends infer U
    ? UnionToIntersection<U>
    : never;

export class CsvSerializer<S extends MetaEntry<string, ZodType>[]> {
    constructor(
        private schema: S,
        private opts: {
            parse?: Partial<Papa.ParseConfig>;
            unparse?: Partial<Papa.UnparseConfig>;
        } = {},
    ) {}

    import(csvStr: string): OutputObject<S>[] {
        const papaRes = Papa.parse<{ [k: string]: string | undefined }>(csvStr, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim(),
            transform: (v) => v.trim() || undefined,
            ...(this.opts.parse ?? {}),
        });
        if (papaRes.errors.length > 0) {
            throw Object.assign(AggregateError(papaRes.errors), {
                meta: papaRes.meta,
            });
        }

        const data = z
            .object(Object.fromEntries(this.schema.map(([h, _kp, zt]) => [h, zt])))
            .array()
            .decode(papaRes.data);

        const objs = data.map((row) => {
            const obj = {};
            for (const [hdr, kp] of this.schema) {
                dset(obj, kp, row[hdr]);
            }
            return obj;
        });

        return objs as OutputObject<S>[];
    }

    export(entries: OutputObject<S>[]): string {
        const hdrRow = this.schema.map(([h]) => h);
        const rows = entries.map((e) => {
            return this.schema.map(([_h, kp, zt]) => zt.encode(dlv(e as object, kp)) ?? '');
        });

        return Papa.unparse([hdrRow, ...rows], this.opts.unparse);
    }
}
