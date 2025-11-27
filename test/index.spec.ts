import assert from 'node:assert';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { CsvSerializer } from '../src/index';

describe('CsvSerializer', () => {
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

    it('should import CSV string into nested objects with complex types', () => {
        const csvInput = `
ID,Status,Is Admin,Created At,Score
101,active,true,2023-01-01,95
102,,false,2023-02-15,80
    `.trim();

        const result = serializer.import(csvInput);

        assert.strictEqual(result.length, 2);

        // Row 1
        assert.strictEqual(result[0].id, '101');
        assert.strictEqual(result[0].status, 'active');
        assert.strictEqual(result[0].isAdmin, true);
        assert.ok(result[0].meta?.createdAt instanceof Date);
        assert.strictEqual(result[0].meta?.createdAt.toISOString().slice(0, 10), '2023-01-01');
        assert.strictEqual(result[0].meta?.scores?.primary, 95);

        // Row 2 (checking optional handling and empty strings)
        assert.strictEqual(result[1].id, '102');
        assert.strictEqual(result[1].status, undefined);
        assert.strictEqual(result[1].isAdmin, false);
        assert.strictEqual(result[1].meta?.scores?.primary, 80);
    });

    it('should export nested objects back to CSV string correctly', () => {
        const data = [
            {
                id: '201',
                status: 'inactive' as const,
                isAdmin: false,
                meta: {
                    createdAt: new Date('2023-12-25T00:00:00Z'),
                    scores: { primary: 100 },
                },
            },
            {
                id: '202',
                // status is undefined
                isAdmin: true,
                meta: {
                    createdAt: new Date('2024-01-01T00:00:00Z'),
                    scores: { primary: 50 },
                },
            },
        ];

        const csvOutput = serializer.export(data);

        // Verify headers
        assert.ok(csvOutput.includes('ID,Status,Is Admin,Created At,Score'));

        // Verify Row 1
        assert.ok(csvOutput.includes('201,inactive,false,2023-12-25,100'));

        // Verify Row 2 (missing status should be empty between commas)
        assert.ok(csvOutput.includes('202,,true,2024-01-01,50'));
    });

    it('should handle arbitrary deep nesting', () => {
        const deepSerializer = new CsvSerializer([
            ['Root', 'root', z.string()],
            ['Deep', 'a.b.c.d.value', z.string()],
        ] as const);

        const input = `Root,Deep\nroot_val,deep_val`;
        const imported = deepSerializer.import(input);

        assert.strictEqual(imported[0].root, 'root_val');
        assert.strictEqual(imported[0].a.b.c.d.value, 'deep_val');

        const output = deepSerializer.export(imported);
        assert.ok(output.includes('root_val,deep_val'));
    });

    it('should throw validation errors with useful metadata on malformed CSV import', () => {
        const invalidCsv = `
ID,Status,Is Admin,Created At,Score
103,INVALID_STATUS,not_bool,2023-01-01,nan
    `.trim();

        try {
            serializer.import(invalidCsv);
            assert.fail('Should have thrown an error');
        } catch (err: any) {
            // Zod errors are typically an array of issues or a ZodError instance
            assert.ok(err instanceof z.ZodError || Array.isArray(err.issues));
        }
    });

    it('should handle empty/undefined values gracefully during export', () => {
        // Manually constructing partial data to test resilience
        const partialData: any = [
            {
                id: '300',
                meta: {}, // Missing nested structure entirely
            },
        ];

        // dlv should handle the missing path 'meta.createdAt' -> undefined -> encoded as ""
        const output = serializer.export(partialData);

        // Expect: 300,,,,""
        const lines = output.split('\n').filter(Boolean); // split and remove empty lines
        const dataLine = lines[1];

        assert.ok(dataLine.startsWith('300,'), 'Should start with ID');
        // We expect 4 commas for 5 columns
        assert.strictEqual((dataLine.match(/,/g) || []).length, 4);
    });
});
