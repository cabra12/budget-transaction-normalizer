import request from 'supertest'
import app from '../src/app'

beforeEach(async () => {
    await request(app).post('/__reset')
})

describe('POST /transactions/import', () => {
    test('imports a valid JSON transaction', async () => {
        const res = await request(app).post('/transactions/import').send({ merchant: 'Trader Joes', amount: 45.5, date: '2026-05-01', category: 'Groceries' })

        expect(res.status).toBe(201)
        expect(res.body.format).toBe('json')
        expect(res.body.importedCount).toBe(1)
        expect(res.body.rejectedCount).toBe(0)
    })

    test('imports a valid XML transaction', async () => {
        const xml = `
      <transactions>
        <transaction>
          <description>Gas Station</description>
          <debit>28.40</debit>
          <postedDate>2026-05-04</postedDate>
        </transaction>
      </transactions>
    `
        const res = await request(app).post('/transactions/import').set('Content-Type', 'application/xml').send(xml)

        expect(res.status).toBe(201)
        expect(res.body.format).toBe('xml')
        expect(res.body.importedCount).toBe(1)
    })

    test('returns 400 for an empty body', async () => {
        const res = await request(app).post('/transactions/import').set('Content-Type', 'application/json').send()

        expect(res.status).toBe(400)
    })

    test('returns 400 for malformed XML', async () => {
        const res = await request(app).post('/transactions/import').set('Content-Type', 'application/xml').send('<transactions><transaction>oops</transactions>')

        expect(res.status).toBe(400)
        expect(res.body.error).toMatch(/Malformed XML/)
    })

    test('partially imports a JSON array, rejecting invalid records', async () => {
        const res = await request(app)
            .post('/transactions/import')
            .send([
                { merchant: 'Coffee Shop', amount: 4.5, date: '2026-05-01' },
                { merchant: '', amount: 4.5, date: '2026-05-01' },
            ])

        expect(res.status).toBe(201)
        expect(res.body.importedCount).toBe(1)
        expect(res.body.rejectedCount).toBe(1)
    })
})

describe('GET /transactions', () => {
    test('returns each imported transaction with a unique id', async () => {
        await request(app).post('/transactions/import').send({ merchant: 'Trader Joes', amount: 20, date: '2026-05-01', category: 'Groceries' })

        const res = await request(app).get('/transactions')
        expect(res.status).toBe(200)
        expect(res.body.transactions).toHaveLength(1)
        expect(typeof res.body.transactions[0].id).toBe('string')
        expect(res.body.transactions[0].id.length).toBeGreaterThan(0)
    })
})

describe('PATCH /transactions/:id', () => {
    test('updates the category of an existing transaction', async () => {
        const importRes = await request(app).post('/transactions/import').send({ merchant: 'Gas Station', amount: 28.4, date: '2026-05-04' }) // no category -> defaults to Uncategorized

        const id = importRes.body.imported[0].id

        const patchRes = await request(app).patch(`/transactions/${id}`).send({ category: 'Transportation' })

        expect(patchRes.status).toBe(200)
        expect(patchRes.body.transaction.category).toBe('Transportation')
        expect(patchRes.body.transaction.id).toBe(id)
    })

    test('returns 404 for a nonexistent id', async () => {
        const res = await request(app).patch('/transactions/does-not-exist').send({ category: 'Transportation' })

        expect(res.status).toBe(404)
    })

    test('returns 400 when category is missing from the request body', async () => {
        const importRes = await request(app).post('/transactions/import').send({ merchant: 'Gas Station', amount: 28.4, date: '2026-05-04' })

        const id = importRes.body.imported[0].id

        const res = await request(app).patch(`/transactions/${id}`).send({})
        expect(res.status).toBe(400)
    })
})

describe('GET /transactions/summary', () => {
    test('returns zero totals when no transactions have been imported', async () => {
        const res = await request(app).get('/transactions/summary')
        expect(res.status).toBe(200)
        expect(res.body.transactionCount).toBe(0)
        expect(res.body.totalsByCategory).toEqual({})
    })

    test('returns correct totals after importing transactions', async () => {
        await request(app).post('/transactions/import').send({ merchant: 'Trader Joes', amount: 20, date: '2026-05-01', category: 'Groceries' })
        await request(app).post('/transactions/import').send({ merchant: 'Whole Foods', amount: 15.5, date: '2026-05-02', category: 'Groceries' })

        const res = await request(app).get('/transactions/summary')
        expect(res.status).toBe(200)
        expect(res.body.transactionCount).toBe(2)
        expect(res.body.totalsByCategory).toEqual({ Groceries: 35.5 })
    })
})
