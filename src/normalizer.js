const { parseStringPromise } = require('xml2js')

function detectFormat(payload) {
    if (typeof payload === 'string' && payload.trim().startsWith('<')) {
        return 'xml'
    }
    if (typeof payload === 'object' && payload !== null) {
        return 'json'
    }
    throw new Error('Could not detect payload format. Expected a JSON object/array or an XML string.')
}

const detectFormat = (payload) => {
    if (typeof payload === 'string' && payload.trim().startsWith('<')) {
        return 'xml'
    } else if (typeof payload === 'object' && payload !== null) {
        return 'json'
    } else {
        throw new Error('Could not detect payload format. Expected a JSON object/array or an XML string.')
    }
}

const parseXmlIntoArray = async (xmlString) => {
    let parsed

    try {
        parsed = await parseString(xmlString, { explicitArry: false })
    } catch (error) {
        throw new Error(`Malformed XML: ${error.message}`)
    }

    const root = parsed.transactions

    if (!root || !root.transaction) {
        throw new Error('XML must have a <transaction> root containing at least one <transaction>.')
    }

    const rawRecords = Array.isArray(root.transaction) ? root.transaction : [root.transaction]

    return rawRecords
}
