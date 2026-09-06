# Budget Transaction Normalizer

A REST API that ingests personal-finance transaction data from two different
formats. These two formats are JSON (like from a budgeting app export) and XML (like from
a bank statement export). This application normalizes both into a single, consistent
schema. It also returns spend totals grouped by category.

## The Problem

Personal finance data rarely comes from one source in one shape. A budgeting
app might export `{ merchant, amount, date, category }` as JSON, while a bank
statement export might use XML with separate debit/credit fields and no
category at all. Before you can do anything useful with that data (like
building a budgeting dashboard), you need a service that can take both shapes
in and produce one clean, reliable format out. Malformed and incomplete records should
be able to be taken in without crashingw with this program.

## What It Does

This program uses REST principles and HTTP methods such as POST, GET, and PATCH.

- **`POST /transactions/import`** — accepts either a JSON object/array or an
  XML string, auto-detects the format, and normalizes every record into:

```json
{
    "id": "b3f1c2e4-...",
    "merchant": "Trader Joes",
    "amount": 45.5,
    "date": "2026-05-01",
    "category": "Groceries",
    "source": "json"
}
```

Invalid records (missing fields, bad dates, negative amounts, XML records
missing both debit and credit) are rejected individually with a reason,
rather than failing the entire batch.

- **`GET /transactions`** — lists every imported transaction, including its
  generated `id`.

- **`GET /transactions/summary`** — returns transaction totals grouped by
  category.

- **`PATCH /transactions/:id`** — updates a transaction's `category`. Useful
  because bank-statement (XML) imports don't include a category, so they land
  as `"Uncategorized"` until corrected.

## Tech Stack

- Node.js / Express
- TypeScript
- xml2js for XML parsing
- Jest + ts-jest + Supertest for unit and integration testing
- GitHub Actions for CI — type-checks (tsc --noEmit) and runs the full
  test suite automatically on every push and pull request to main

## Running Locally

```bash
npm install
npm run dev       # runs on http://localhost:3000 with hot reload
npm test          # runs the Jest test suite
npx tsc --noEmit  # type-checks without emitting compiled output
```

## Example Requests

JSON Import:

```bash
curl -X POST http://localhost:3000/transactions/import \
  -H "Content-Type: application/json" \
  -d '{"merchant": "Trader Joes", "amount": 45.50, "date": "2026-05-01", "category": "Groceries"}'
```

XML Import:

```bash
curl -X POST http://localhost:3000/transactions/import \
  -H "Content-Type: application/xml" \
  -d '<transactions><transaction><description>Gas Station</description><debit>28.40</debit><postedDate>2026-05-04</postedDate></transaction></transactions>'
```

Correcting a Category:

```bash
curl -X PATCH http://localhost:3000/transactions/<id> \
  -H "Content-Type: application/json" \
  -d '{"category": "Transportation"}'
```

## How This Would Be Deployed on AWS

This project is not currently deployed. If it were deployed on AWS, the architecture
would be:

- **API Gateway**: exposes the REST endpoints publicly
- **AWS Lambda**: runs the Express app (via a Lambda adapter) behind API
  Gateway, so it only runs (and only costs money) when a request comes in
- **S3**: could store raw uploaded files if this evolved to accept file
  uploads rather than just request bodies
- **DynamoDB or RDS**: for persistent transaction storage in place of the
  in-memory array

## What I'd improve Next

- Persist transactions to a real database instead of an in-memory array
- Support CSV as a third input format
- Add authentication so transaction data is scoped per user
- Add date-range filtering to the summary endpoint
- Containerize with Docker for deployment to a container-based AWS service
