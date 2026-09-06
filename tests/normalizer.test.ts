import { detectFormat, normalizeJsonRecord, normalizeXmlRecord, normalizePayload, summarizeByCategory } from '../src/normalizer'

describe('detectFormat', () => {
    test('detects XML from a string starting with "<"', () => {
        expect(detectFormat('<transactions></transactions>')).toBe('xml')
    })

    test('detects JSON from an object', () => {
        expect(detectFormat({ merchant: 'Coffee Shop' })).toBe('json')
    })

    test('detects JSON from an array', () => {
        expect(detectFormat([{ merchant: 'Coffee Shop' }])).toBe('json')
    })

    test('throws on an unrecognizable payload', () => {
        expect(() => detectFormat(42)).toThrow(/Could not detect payload format/)
    })
})

describe('normalizeJsonRecord', () => {
    test('normalizes a valid record', () => {
        const result = normalizeJsonRecord({
            merchant: 'Trader Joes',
            amount: 45.5,
            date: '2026-05-01',
            category: 'Groceries',
        })
        expect(result).toEqual({
            merchant: 'Trader Joes',
            amount: 45.5,
            date: '2026-05-01',
            category: 'Groceries',
            source: 'json',
        })
    })

    test('defaults category to "Uncategorized" when missing', () => {
        const result = normalizeJsonRecord({
            merchant: 'Trader Joes',
            amount: 45.5,
            date: '2026-05-01',
        })
        expect(result.category).toBe('Uncategorized')
    })

    test('throws when merchant is missing', () => {
        expect(() => normalizeJsonRecord({ amount: 10, date: '2026-05-01' })).toThrow(/merchant/)
    })

    test('throws when amount is not a number', () => {
        expect(() => normalizeJsonRecord({ merchant: 'Shop', amount: 'not-a-number', date: '2026-05-01' })).toThrow(/amount/)
    })

    test('throws when amount is negative', () => {
        expect(() => normalizeJsonRecord({ merchant: 'Shop', amount: -5, date: '2026-05-01' })).toThrow(/cannot be negative/)
    })

    test('throws when date is missing or unparseable', () => {
        expect(() => normalizeJsonRecord({ merchant: 'Shop', amount: 5, date: 'not-a-date' })).toThrow(/date/)
    })
})

describe('normalizeXmlRecord', () => {
    test('normalizes a valid debit record', () => {
        const result = normalizeXmlRecord({
            description: 'Grocery Store',
            debit: '32.10',
            postedDate: '2026-05-02',
        })
        expect(result).toEqual({
            merchant: 'Grocery Store',
            amount: 32.1,
            date: '2026-05-02',
            category: 'Uncategorized',
            source: 'xml',
        })
    })

    test('normalizes a valid credit record as a negative amount', () => {
        const result = normalizeXmlRecord({
            description: 'Refund',
            credit: '10.00',
            postedDate: '2026-05-03',
        })
        expect(result.amount).toBe(-10)
    })

    test('throws when both debit and credit are present', () => {
        expect(() =>
            normalizeXmlRecord({
                description: 'Weird Record',
                debit: '5',
                credit: '5',
                postedDate: '2026-05-01',
            }),
        ).toThrow(/Exactly one of/)
    })

    test('throws when neither debit nor credit is present', () => {
        expect(() => normalizeXmlRecord({ description: 'Weird Record', postedDate: '2026-05-01' })).toThrow(/Exactly one of/)
    })

    test('throws when description is missing', () => {
        expect(() => normalizeXmlRecord({ debit: '5', postedDate: '2026-05-01' })).toThrow(/description/)
    })

    test('throws when postedDate is missing or unparseable', () => {
        expect(() => normalizeXmlRecord({ description: 'Shop', debit: '5', postedDate: 'nope' })).toThrow(/postedDate/)
    })
})

describe('normalizePayload (end-to-end)', () => {
    test('normalizes a JSON array payload, separating valid and invalid records', async () => {
        const payload = [
            { merchant: 'Coffee Shop', amount: 4.5, date: '2026-05-01', category: 'Dining' },
            { merchant: '', amount: 4.5, date: '2026-05-01' }, // invalid: no merchant
        ]
        const result = await normalizePayload(payload)
        expect(result.format).toBe('json')
        expect(result.normalized).toHaveLength(1)
        expect(result.rejected).toHaveLength(1)
        expect(result.rejected[0].reason).toMatch(/merchant/)
    })

    test('normalizes an XML string payload with multiple transactions', async () => {
        const xml = `
      <transactions>
        <transaction>
          <description>Gas Station</description>
          <debit>28.40</debit>
          <postedDate>2026-05-04</postedDate>
        </transaction>
        <transaction>
          <description>Paycheck Deposit</description>
          <credit>1500.00</credit>
          <postedDate>2026-05-05</postedDate>
        </transaction>
      </transactions>
    `
        const result = await normalizePayload(xml)
        expect(result.format).toBe('xml')
        expect(result.normalized).toHaveLength(2)
        expect(result.normalized[0].amount).toBe(28.4)
        expect(result.normalized[1].amount).toBe(-1500)
    })

    test('rejects malformed XML by returning it via the rejected list or throwing', async () => {
        const malformed = '<transactions><transaction>oops</transactions>'
        await expect(normalizePayload(malformed)).rejects.toThrow(/Malformed XML/)
    })
})

describe('summarizeByCategory', () => {
    test('sums amounts grouped by category', () => {
        const transactions = [
            { merchant: 'A', amount: 20, date: '2026-05-01', category: 'Groceries', source: 'json' as const },
            { merchant: 'B', amount: 15.5, date: '2026-05-02', category: 'Groceries', source: 'json' as const },
            { merchant: 'C', amount: 9.25, date: '2026-05-03', category: 'Dining', source: 'json' as const },
        ]
        expect(summarizeByCategory(transactions)).toEqual({
            Groceries: 35.5,
            Dining: 9.25,
        })
    })
})
