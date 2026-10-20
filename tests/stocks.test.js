const test = require("node:test")
const assert = require("node:assert/strict")
const S = require("../plugin/core/Stocks.js")

const DAY = 86400
const NOW = Date.UTC(2026, 9, 19, 20) / 1000

// A year of daily closes rising by 1 a day to 200, plus a v7 quote.
function raw(overrides) {
  const times = []
  const closes = []
  for (let i = 365; i >= 0; i--) { times.push(NOW - i * DAY); closes.push(200 - i * 0.25) }
  return {
    chart: { chart: { result: [{
      meta: { symbol: "BPAC11.SA", currency: "BRL", exchangeName: "SAO", fullExchangeName: "São Paulo", instrumentType: "EQUITY", regularMarketPrice: 200, regularMarketTime: NOW, longName: "Banco BTG Pactual S.A." },
      timestamp: times,
      indicators: { quote: [{ close: closes, high: closes.map((c) => c + 1), low: closes.map((c) => c - 1) }] }
    }] } },
    quote: { quoteResponse: { result: [Object.assign({
      symbol: "BPAC11.SA", regularMarketPrice: 200, regularMarketPreviousClose: 160, regularMarketTime: NOW,
      marketCap: 263836565504, trailingPE: 127.52443, trailingAnnualDividendYield: 0.0045, epsTrailingTwelveMonths: 0.614,
      averageDailyVolume3Month: 12514316, marketState: "POSTPOST"
    }, overrides || {})] } }
  }
}

test("B3 tickers by shape, others need a stock word or $", () => {
  assert.equal(S.parse("IVVB11").symbol, "IVVB11.SA")
  assert.equal(S.parse("petr4f").symbol, "PETR4.SA")
  assert.equal(S.parse("cotação bpac11").symbol, "BPAC11.SA")
  assert.equal(S.parse("META stock").symbol, "META")
  assert.equal(S.parse("$meta").symbol, "META")
  assert.equal(S.parse("aapl ação").symbol, "AAPL")
  assert.equal(S.parse("ibovespa").symbol, "^BVSP")
  assert.equal(S.parse("bitcoin").symbol, "BTC-USD")
  for (const q of ["meta", "firefox", "spotify", "1password", "2048", "eth", "dow", "pl", "abcd123"]) assert.equal(S.parse(q), null, q)
})

test("quantity, target currency and indicators", () => {
  assert.deepEqual(S.parse("10 x ivvb11"), { symbol: "IVVB11.SA", ticker: "IVVB11", shares: 10, indicator: "", target: "", explicit: false })
  assert.equal(S.parse("2 meta stock em brl").target, "BRL")
  assert.equal(S.parse("bpac11 p/l").indicator, "pe")
  assert.equal(S.parse("valor de mercado bpac11").indicator, "mcap")
  assert.equal(S.parse("meta dy").indicator, "dy")
  assert.equal(S.parse("ivvb11 7 dias").indicator, "d7")
  assert.equal(S.parse("ivvb11 30d").indicator, "d30")
  assert.equal(S.parse("bpac11 52 semanas").indicator, "year")
})

test("normalize computes changes from the daily closes", () => {
  const q = S.normalize(raw(), NOW)
  assert.equal(q.price, 200)
  assert.equal(q.d1, 25)
  assert.equal(q.d7.toFixed(4), (200 / 198.25 * 100 - 100).toFixed(4))
  assert.equal(q.d30.toFixed(4), (200 / 192.5 * 100 - 100).toFixed(4))
  assert.equal(q.y1.toFixed(4), (200 / 108.75 * 100 - 100).toFixed(4))
  assert.equal(q.yearHigh, 201)
  assert.equal(q.yearLow, 107.75)
  assert.equal(q.dy.toFixed(2), "0.45")
  assert.equal(S.normalize({ chart: null, quote: { quoteResponse: { result: [] } } }), null)
})

test("one card: price, 1D, sparkline, chips and key stats", () => {
  const r = S.rows(S.normalize(raw(), NOW), S.parse("bpac11"), null)
  const d = JSON.parse(r.card.cardData)
  assert.equal(r.card.title, "R$ 200,00")
  assert.equal(d.ticker, "BPAC11")
  assert.equal(d.change, "1D +25,00%")
  assert.equal(d.tone, "up")
  assert.equal(d.spark.length, 66)
  assert.deepEqual(d.chips.map((c) => c.label + " " + c.text), ["7D +0,88%", "30D +3,90%", "YTD +57,48%", "1Y +83,91%"])
  assert.deepEqual(d.stats.map((s) => s.label + " " + s.text), ["52W 107,75 – 201,00", "Mkt cap R$ 263,84 bi", "P/E 127,5", "DY 0,45%"])
  assert.equal(r.card.url, "https://www.google.com/finance/quote/BPAC11%3ABVMF")
})

test("an indicator query puts that value on the card", () => {
  const r = S.rows(S.normalize(raw(), NOW), S.parse("bpac11 p/l"), null)
  assert.equal(r.card.title, "127,52")
  assert.equal(JSON.parse(r.card.cardData).valueCaption, "P/E ratio")
})

test("positions and currency conversion", () => {
  const rates = { rates: { EUR: 1, BRL: 5, USD: 1 } }
  const q = S.normalize(raw(), NOW)
  const position = S.rows(q, S.parse("10 bpac11"), rates).card
  assert.equal(position.title, "R$ 2.000,00")
  assert.equal(JSON.parse(position.cardData).valueCaption, "10 × R$ 200,00")
  assert.equal(S.rows(q, S.parse("bpac11 em usd"), rates).card.title, "$ 40.00")
})

test("indices are points, not money", () => {
  const index = raw()
  Object.assign(index.chart.chart.result[0].meta, { symbol: "^BVSP", instrumentType: "INDEX" })
  const r = S.rows(S.normalize(index, NOW), S.parse("ibov"), null)
  assert.equal(r.card.title, "200,00")
})

test("company names go to Yahoo's search", () => {
  assert.equal(S.parse("stock berkshire").symbol, "?berkshire", "too long for a ticker")
  assert.equal(S.parse("ação itau").symbol, "ITAU", "short words are tried as a symbol first")
  assert.equal(S.parse("ação banco do brasil").symbol, "?banco do brasil")
  assert.equal(S.parse("coca cola stock").symbol, "?coca cola")
  assert.equal(S.parse("brk.b stock").symbol, "BRK-B")
  assert.equal(S.parse("banco do brasil"), null, "names need a stock word")
})

test("the card names the symbol Yahoo resolved", () => {
  const r = raw()
  r.chart.chart.result[0].meta.symbol = "BRK-B"
  r.chart.chart.result[0].meta.currency = "USD"
  r.quote.quoteResponse.result[0].symbol = "BRK-B"
  const card = S.rows(S.normalize(r, NOW), S.parse("stock berkshire"), null).card
  assert.equal(JSON.parse(card.cardData).ticker, "BRK-B")
  assert.equal(JSON.parse(S.missingCard(S.parse("stock asdfqwer")).cardData).name, "No match on Yahoo Finance")
})
