import express from 'express'
import crypto from 'crypto'
import { normalizePayload, summarizeByCategory } from './normalizer'

type NormalizedData = {
    merchant: string
    amount: number
    date: string
    category: string
    source: 'json' | 'xml'
}

type dataWithIds = NormalizedData & {
    id: string
}

const app = express()

app.use(express.json({ limit: '1mb' }))
app.use(express.text({ type: 'application/xml', limit: '1mb' }))

let transactions: dataWithIds[] = []

app.post('/transactions/import', async (req, res) => {
    const payload = req.body

    const isEmptyObject = typeof payload === 'object' && payload !== null && !Array.isArray(payload) && Object.keys(payload).length === 0
    const isEmptyArray = Array.isArray(payload) && payload.length === 0

    if (payload === undefined || payload === null || payload === '' || isEmptyObject || isEmptyArray) {
        return res.status(400).json({ error: 'Request body must not be empty.' })
    }

    let result
    try {
        result = await normalizePayload(payload)
    } catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ error: error.message })
        }
        return res.status(400).json({ error: 'Unknown error occurred while normalizing payload.' })
    }

    const withIds = result.normalized.map(
        (data: NormalizedData): dataWithIds => ({
            id: crypto.randomUUID(),
            ...data,
        }),
    )

    transactions = transactions.concat(withIds)

    return res.status(201).json({
        format: result.format,
        importedCount: withIds.length,
        rejectedCount: result.rejected.length,
        imported: withIds,
        rejected: result.rejected,
    })
})

app.get('/transactions', (req, res) => {
    return res.status(200).json({ transactions })
})

app.get('/transactions/summary', (req, res) => {
    const totals = summarizeByCategory(transactions)
    return res.status(200).json({
        transactionCount: transactions.length,
        totalsByCategory: totals,
    })
})

app.patch('/transactions/:id', (req, res) => {
    const { id } = req.params
    const { category } = req.body || {}

    if (!category || typeof category !== 'string' || !category.trim()) {
        return res.status(400).json({
            error: 'Request body must include a non-empty "category" string.',
        })
    }

    const transaction = transactions.find((t) => t.id === id)
    if (!transaction) {
        return res.status(404).json({ error: `No transaction found with id "${id}".` })
    }

    transaction.category = category.trim()
    return res.status(200).json({ transaction })
})

app.post('/__reset', (req, res) => {
    transactions = []
    res.status(204).send()
})

export default app
