const express = require('express')
const crypto = require('crypto')
const { normalizePayload, summarizeByCategory } = require('./normalizer')

const app = express()

app.use(express.json({ limit: '1mb' }))
app.use(express.text({ type: 'application/xml', limit: '1mb' }))

let transactions = []
