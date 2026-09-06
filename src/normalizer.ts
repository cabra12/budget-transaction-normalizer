const { parseStringPromise } = require('xml2js')

type Format = 'json' | 'xml'

interface RawXmlForArray {
    description: string
    debit?: string
    credit?: string
    postedDate: string
}

interface RawJsonRecord {
    merchant?: unknown
    amount?: unknown
    date?: unknown
    category?: unknown
}

interface RawXmlRecord {
    description?: unknown
    debit?: unknown
    credit?: unknown
    postedDate?: unknown
}

interface NormalizedData {
    merchant: string
    amount: number
    date: string
    category: string
    source: Format
}

interface NormalizedTransaction {
    format: Format
    normalized: NormalizedData[]
    rejected: { record: unknown; reason: string }[]
}

export const detectFormat = (payload: unknown): 'json' | 'xml' => {
    if (typeof payload === 'string' && payload.trim().startsWith('<')) {
        return 'xml'
    } else if (typeof payload === 'object' && payload !== null) {
        return 'json'
    } else {
        throw new Error('Could not detect payload format. Expected a JSON object/array or an XML string.')
    }
}

export const parseXmlIntoArray = async (xmlString: string): Promise<RawXmlForArray[]> => {
    let parsed

    try {
        parsed = await parseStringPromise(xmlString, { explicitArray: false })
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Malformed XML: ${error.message}`)
        }
        throw new Error('Malformed XML: Unknown error')
    }

    const root = parsed.transactions

    if (!root || !root.transaction) {
        throw new Error('XML must have a <transaction> root containing at least one <transaction>.')
    }

    const rawRecords: RawXmlForArray[] = Array.isArray(root.transaction) ? root.transaction : [root.transaction]

    return rawRecords
}

export const normalizeJsonRecord = (record: RawJsonRecord): NormalizedData => {
    const { merchant, amount, date, category } = record

    if (!merchant || typeof merchant !== 'string' || !merchant.trim()) {
        throw new Error('Missing or invalid "merchant" (must be a non-empty string).')
    }

    const numericAmount = Number(amount)
    if (amount === undefined || amount === null || Number.isNaN(numericAmount)) {
        throw new Error('Missing or invalid "amount" (must be a number).')
    }
    if (numericAmount < 0) {
        throw new Error('"amount" cannot be negative in JSON-format records. Use a positive number to represent spend.')
    }

    if (!date || typeof date !== 'string' || Number.isNaN(Date.parse(date))) {
        throw new Error('Missing or invalid "date" (must be a parseable date string).')
    }

    return {
        merchant: merchant.trim(),
        amount: numericAmount,
        date: new Date(date).toISOString().slice(0, 10),
        category: category && typeof category === 'string' && category.trim() ? category.trim() : 'Uncategorized',
        source: 'json',
    }
}

export const normalizeXmlRecord = (record: RawXmlRecord): NormalizedData => {
    const { description, debit, credit, postedDate } = record

    if (!description || typeof description !== 'string' || !description.trim()) {
        throw new Error('Missing or invalid "description" (must be a non-empty string).')
    }

    const hasDebit = debit !== undefined && debit !== null && debit !== ''
    const hasCredit = credit !== undefined && credit !== null && credit !== ''

    if (hasDebit === hasCredit) {
        throw new Error('Exactly one of "debit" or "credit" must be present (not both, not neither).')
    }

    let amount
    if (hasDebit) {
        const numericDebit = Number(debit)
        if (Number.isNaN(numericDebit) || numericDebit < 0) {
            throw new Error('"debit" must be a non-negative number.')
        }
        amount = numericDebit
    } else {
        const numericCredit = Number(credit)
        if (Number.isNaN(numericCredit) || numericCredit < 0) {
            throw new Error('"credit" must be a non-negative number.')
        }
        amount = -numericCredit // money received reduces net spend
    }

    if (!postedDate || typeof postedDate !== 'string' || Number.isNaN(Date.parse(postedDate))) {
        throw new Error('Missing or invalid "postedDate" (must be a parseable date string).')
    }

    return {
        merchant: description.trim(),
        amount: amount,
        date: new Date(postedDate).toISOString().slice(0, 10),
        category: 'Uncategorized',
        source: 'xml',
    }
}

export const normalizePayload = async (payload: unknown): Promise<NormalizedTransaction> => {
    const format = detectFormat(payload)

    let rawRecords
    if (format === 'xml' && typeof payload === 'string') {
        rawRecords = await parseXmlIntoArray(payload)
    } else {
        rawRecords = Array.isArray(payload) ? payload : [payload]
    }

    const normalized = []
    const rejected = []

    for (const rawRecord of rawRecords) {
        try {
            const record = format === 'xml' ? normalizeXmlRecord(rawRecord) : normalizeJsonRecord(rawRecord)
            normalized.push(record)
        } catch (err) {
            if (err instanceof Error) {
                rejected.push({ record: rawRecord, reason: err.message })
            }
        }
    }

    return { format, normalized, rejected }
}

export const summarizeByCategory = (transactions: NormalizedData[]): Record<string, number> => {
    const totals: Record<string, number> = {}
    for (const t of transactions) {
        const key = t.category || 'Uncategorized'
        totals[key] = Math.round(((totals[key] || 0) + t.amount) * 100) / 100
    }
    return totals
}
