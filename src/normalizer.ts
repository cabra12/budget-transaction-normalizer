const { parseStringPromise } = require('xml2js')

interface RawTransactionRecords {
    description: string
    debit?: string
    postedDate: string
}

interface RawJsonRecord {
    merchant?: unknown
    amount?: unknown
    date?: unknown
    category?: unknown
}

const detectFormat = (payload: unknown): string => {
    if (typeof payload === 'string' && payload.trim().startsWith('<')) {
        return 'xml'
    } else if (typeof payload === 'object' && payload !== null) {
        return 'json'
    } else {
        throw new Error('Could not detect payload format. Expected a JSON object/array or an XML string.')
    }
}

const parseXmlIntoArray = async (xmlString: string): Promise<RawTransactionRecords[]> => {
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

    const rawRecords: RawTransactionRecords[] = Array.isArray(root.transaction) ? root.transaction : [root.transaction]

    return rawRecords
}

const normalizeJsonRecord = (record: RawJsonRecord) => {
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
