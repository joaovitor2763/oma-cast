// Stock, index and crypto quotes for root search [D] (not a Raycast built-in).
// Data: Yahoo Finance's unofficial chart (1y daily) and quote endpoints,
// fetched by plugin/scripts/yahoo-quote; see services/StockQuoteSource.qml.
//
// Queries (folded, so accents and case don't matter):
//   ivvb11, bpac11, petr4         B3 tickers by shape (4 letters + 1–2 digits)
//   meta stock, $meta, aapl ação  any Yahoo symbol, with a stock word or "$"
//   stock berkshire, ação itau    a company name, resolved by Yahoo's search
//   ibov, s&p 500, nasdaq, bitcoin, eth   well-known names
//   10 ivvb11                     position value
//   meta stock em brl             price in another currency (ECB rates)
//   bpac11 p/l, meta dy, ivvb11 30d, bpac11 market cap   one indicator
// One card per quote: price and 1D change, a 3-month sparkline, 7D/30D/YTD/1Y
// chips and a line of key stats (52W range, market cap, P/E, yield). An
// indicator query puts that indicator in the price's place.

var STOCK_WORDS = ["stock", "stocks", "acao", "acoes", "share", "shares", "quote", "cotacao", "preco", "price", "ticker"]

var NAMED = {
  ibov: "^BVSP", ibovespa: "^BVSP",
  "s&p 500": "^GSPC", "s&p500": "^GSPC", "sp500": "^GSPC", "sp 500": "^GSPC", "s&p": "^GSPC",
  nasdaq: "^IXIC", "dow jones": "^DJI", "dow": "^DJI",
  bitcoin: "BTC-USD", btc: "BTC-USD", ethereum: "ETH-USD", eth: "ETH-USD", solana: "SOL-USD"
}
// Names short enough to be a word in other searches need a stock word.
var NAMED_NEEDS_WORD = { "dow": true, "s&p": true, "eth": true }

var DISPLAY_NAMES = { "^BVSP": "IBOV", "^GSPC": "S&P 500", "^IXIC": "NASDAQ", "^DJI": "DOW", "BTC-USD": "BTC", "ETH-USD": "ETH", "SOL-USD": "SOL" }

// Indicator words -> key. Longer phrases first.
var INDICATORS = [
  ["previous close", "prev"], ["fechamento anterior", "prev"], ["fechamento", "prev"], ["close", "prev"],
  ["day range", "day"], ["range do dia", "day"], ["minima e maxima", "day"],
  ["year range", "year"], ["52 semanas", "year"], ["52 weeks", "year"], ["52w", "year"], ["52s", "year"],
  ["market cap", "mcap"], ["mkt cap", "mcap"], ["valor de mercado", "mcap"], ["marketcap", "mcap"],
  ["dividend yield", "dy"], ["div yield", "dy"], ["dividendos", "dy"], ["dividends", "dy"], ["yield", "dy"], ["dy", "dy"],
  ["p/e", "pe"], ["pe ratio", "pe"], ["p/l", "pe"], ["pl", "pe"], ["pe", "pe"],
  ["eps", "eps"], ["lpa", "eps"],
  ["avg volume", "volume"], ["volume medio", "volume"], ["volume", "volume"], ["vol", "volume"],
  ["abertura", "open"], ["open", "open"],
  ["7 dias", "d7"], ["7 days", "d7"], ["semana", "d7"], ["week", "d7"], ["7d", "d7"],
  ["30 dias", "d30"], ["30 days", "d30"], ["mes", "d30"], ["month", "d30"], ["30d", "d30"], ["1m", "d30"],
  ["no ano", "ytd"], ["ytd", "ytd"],
  ["12 meses", "y1"], ["1 ano", "y1"], ["1 year", "y1"], ["1y", "y1"], ["12m", "y1"],
  ["hoje", "d1"], ["today", "d1"], ["1d", "d1"], ["dia", "d1"],
  ["bolsa", "exchange"], ["exchange", "exchange"]
]

var LABELS = {
  price: "Price", prev: "Previous close", open: "Open", day: "Day range", year: "Year range (52w)",
  d1: "Change 1D", d7: "Change 7D", d30: "Change 30D", ytd: "Change YTD", y1: "Change 1Y",
  mcap: "Market cap", pe: "P/E ratio", dy: "Dividend yield", eps: "EPS", volume: "Avg volume (3M)", exchange: "Primary exchange"
}

// Yahoo exchange code -> Google Finance exchange, for the "Open in Google Finance" link.
var GOOGLE_EXCHANGES = { SAO: "BVMF", NMS: "NASDAQ", NGM: "NASDAQ", NCM: "NASDAQ", NYQ: "NYSE", PCX: "NYSEARCA", ASE: "NYSEAMERICAN", BTS: "BATS" }
var GOOGLE_INDICES = { "^BVSP": "IBOV:INDEXBVMF", "^GSPC": ".INX:INDEXSP", "^IXIC": ".IXIC:INDEXNASDAQ", "^DJI": ".DJI:INDEXDJX" }

var CURRENCY_WORDS = {
  brl: "BRL", real: "BRL", reais: "BRL", "r$": "BRL",
  usd: "USD", dolar: "USD", dolares: "USD", dollar: "USD", dollars: "USD", "$": "USD",
  eur: "EUR", euro: "EUR", euros: "EUR", gbp: "GBP", jpy: "JPY"
}

function fold(text) {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()
}

function stripIndicator(text) {
  for (var i = 0; i < INDICATORS.length; i++) {
    var phrase = INDICATORS[i][0].replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
    var m = new RegExp("(^|\\s)" + phrase + "$").exec(text) || new RegExp("^" + phrase + "(\\s|$)").exec(text)
    if (m) return { rest: text.replace(m[0], " ").trim(), indicator: INDICATORS[i][1] }
  }
  return { rest: text, indicator: "" }
}

function stripStockWord(text) {
  for (var i = 0; i < STOCK_WORDS.length; i++) {
    var w = STOCK_WORDS[i]
    var m = new RegExp("(^|\\s)" + w + "( (de|do|da|of))?(\\s|$)").exec(text)
    if (m) return { rest: (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).trim(), found: true }
  }
  return { rest: text, found: false }
}

// {symbol, ticker, shares, indicator, target} or null.
function parse(query) {
  var text = fold(query).replace(/\?+$/, "").trim()
  if (!text || text.length > 40) return null

  var target = ""
  var t = /\s+(?:em|in|to|para|pra)\s+(\S+)$/.exec(text)
  if (t && CURRENCY_WORDS[t[1]]) { target = CURRENCY_WORDS[t[1]]; text = text.slice(0, t.index).trim() }

  var shares = 1
  var q = /^(\d+(?:[.,]\d+)?)\s*(?:x\s+)?/.exec(text)
  if (q && q[0].length < text.length) { shares = parseFloat(q[1].replace(",", ".")); text = text.slice(q[0].length).trim() }

  var word = stripStockWord(text)
  text = word.rest
  var ind = stripIndicator(text)
  text = ind.rest
  if (!word.found) { word = stripStockWord(text); text = word.rest }
  var dollar = text.charAt(0) === "$"
  if (dollar) text = text.slice(1).trim()
  if (!text) return null
  var explicit = word.found || dollar || ind.indicator !== ""

  var symbol = ""
  var ticker = ""
  if (NAMED.hasOwnProperty(text) && (explicit || !NAMED_NEEDS_WORD[text])) {
    symbol = NAMED[text]
    ticker = DISPLAY_NAMES[symbol] || symbol
  } else if (/^[a-z]{4}\d{1,2}f?$/.test(text)) {
    ticker = text.replace(/f$/, "").toUpperCase()          // fractional "F" lots trade at the same price
    symbol = ticker + ".SA"
  } else if (explicit && /^[a-z]{1,5}\.[a-z]$/.test(text)) {
    ticker = text.replace(".", "-").toUpperCase()           // BRK.B is BRK-B on Yahoo
    symbol = ticker
  } else if (explicit && /^[a-z]{6,}$/.test(text)) {
    ticker = text.charAt(0).toUpperCase() + text.slice(1)     // too long for a US ticker: a name
    symbol = "?" + text
  } else if (explicit && /^[a-z][a-z0-9.\-=^]{0,11}$/.test(text)) {
    ticker = text.toUpperCase()                               // tried as a symbol, then as a name
    symbol = ticker
  } else if (explicit && /^[a-z0-9&.' -]{2,40}$/.test(text) && /[a-z]{2}/.test(text)) {
    ticker = text.replace(/\b[a-z]/g, function(c) { return c.toUpperCase() })
    symbol = "?" + text                                       // a name: scripts/yahoo-quote searches it
  } else {
    return null
  }
  return { symbol: symbol, ticker: ticker, shares: shares, indicator: ind.indicator, target: target, explicit: explicit }
}

// ------------------------------------------------------------ normalizing

function finiteOr(value, fallback) {
  return typeof value === "number" && isFinite(value) ? value : fallback
}

// Close at or before `when` (seconds), scanning back from the end.
function closeAt(times, closes, when) {
  for (var i = times.length - 1; i >= 0; i--) if (times[i] <= when && closes[i] !== null && closes[i] !== undefined) return closes[i]
  return null
}

function change(price, base) {
  return base ? (price / base - 1) * 100 : null
}

// One quote from the script's {chart, quote} output, or null when Yahoo
// knows no such symbol. nowSec is injected for tests.
function normalize(raw, nowSec) {
  var chart = raw && raw.chart && raw.chart.chart && raw.chart.chart.result && raw.chart.chart.result[0]
  var info = raw && raw.quote && raw.quote.quoteResponse && raw.quote.quoteResponse.result && raw.quote.quoteResponse.result[0]
  if (!chart && !info) return null
  var meta = chart ? chart.meta : {}
  info = info || {}
  var times = chart && chart.timestamp ? chart.timestamp : []
  var bars = chart && chart.indicators && chart.indicators.quote && chart.indicators.quote[0] ? chart.indicators.quote[0] : {}
  var closes = bars.close || []

  var price = finiteOr(info.regularMarketPrice, finiteOr(meta.regularMarketPrice, null))
  if (price === null) return null
  var marketTime = finiteOr(info.regularMarketTime, finiteOr(meta.regularMarketTime, nowSec))
  var prev = finiteOr(info.regularMarketPreviousClose, null)
  if (prev === null) {
    var pct = finiteOr(meta.regularMarketChangePercent, null)
    prev = pct !== null ? price / (1 + pct / 100) : null
  }

  var highs = (bars.high || []).filter(function(v) { return v > 0 })
  var lows = (bars.low || []).filter(function(v) { return v > 0 })
  var yearStart = Date.UTC(new Date(marketTime * 1000).getUTCFullYear(), 0, 1) / 1000

  return {
    symbol: String(meta.symbol || info.symbol || ""),
    name: String(info.longName || meta.longName || info.shortName || meta.shortName || ""),
    currency: String(info.currency || meta.currency || ""),
    exchange: (meta.exchangeName || info.exchange) === "CCC" ? "Crypto" : String(info.fullExchangeName || meta.fullExchangeName || meta.exchangeName || ""),
    exchangeCode: String(meta.exchangeName || info.exchange || ""),
    type: String(meta.instrumentType || info.quoteType || ""),
    marketState: String(info.marketState || ""),
    time: marketTime,
    price: price,
    prev: prev,
    open: finiteOr(info.regularMarketOpen, 0) > 0 ? info.regularMarketOpen : null,
    dayLow: finiteOr(info.regularMarketDayLow, 0) > 0 ? info.regularMarketDayLow : null,
    dayHigh: finiteOr(info.regularMarketDayHigh, 0) > 0 ? info.regularMarketDayHigh : null,
    yearLow: lows.length ? Math.min.apply(null, lows) : finiteOr(info.fiftyTwoWeekLow, null),
    yearHigh: highs.length ? Math.max.apply(null, highs) : finiteOr(info.fiftyTwoWeekHigh, null),
    d1: change(price, prev),
    d7: change(price, closeAt(times, closes, marketTime - 7 * 86400)),
    d30: change(price, closeAt(times, closes, marketTime - 30 * 86400)),
    ytd: change(price, closeAt(times, closes, yearStart - 1)),
    y1: change(price, closes.length ? closes.filter(function(v) { return v !== null })[0] : null),
    mcap: finiteOr(info.marketCap, null),
    pe: finiteOr(info.trailingPE, null),
    dy: finiteOr(info.trailingAnnualDividendYield, null) !== null && info.trailingAnnualDividendYield > 0
      ? info.trailingAnnualDividendYield * 100 : finiteOr(info.dividendYield, null),
    eps: finiteOr(info.epsTrailingTwelveMonths, null),
    volume: finiteOr(info.averageDailyVolume3Month, null),
    // ~3 months of daily closes for the sparkline.
    history: closes.filter(function(v) { return v !== null && v !== undefined }).slice(-66)
  }
}

// --------------------------------------------------------------- display

var SYMBOLS = { BRL: "R$", USD: "$", EUR: "€", GBP: "£", JPY: "¥" }

// Brazilian conventions for reais, US for everything else [D], matching Calc.money.
function number(value, decimals, br) {
  var parts = Math.abs(value).toFixed(decimals).split(".")
  var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, br ? "." : ",")
  return (value < 0 ? "-" : "") + whole + (parts[1] ? (br ? "," : ".") + parts[1] : "")
}

function decimalsFor(value) {
  var abs = Math.abs(value)
  return abs >= 1 ? 2 : (abs >= 0.01 ? 4 : 6)
}

// `code` is a currency, or "pts"/"pts-br" for index points (no symbol).
// Ranges drop cents once the numbers are in the thousands.
function rangeDecimals(value) {
  return Math.abs(value) >= 1000 ? 0 : decimalsFor(value)
}

function money(value, code) {
  var br = code === "BRL" || code === "pts-br"
  var text = number(value, decimalsFor(value), br)
  if (code === "pts" || code === "pts-br") return text
  return SYMBOLS[code] ? SYMBOLS[code] + " " + text : text + " " + code
}

function compact(value, code) {
  var br = code === "BRL" || code === "pts-br"
  var units = br ? [[1e12, " tri"], [1e9, " bi"], [1e6, " mi"], [1e3, " mil"]] : [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]]
  var prefix = SYMBOLS[code] && code !== "pts" ? SYMBOLS[code] + " " : ""
  for (var i = 0; i < units.length; i++)
    if (Math.abs(value) >= units[i][0]) return prefix + number(value / units[i][0], 2, br) + units[i][1]
  return prefix + number(value, 0, br)
}

function percent(value, br) {
  return (value > 0 ? "+" : value < 0 ? "−" : "") + number(Math.abs(value), 2, br) + "%"
}

// {text, copy, tone} for one indicator, or null when Yahoo has no value.
function indicator(q, key, code) {
  var br = code === "BRL" || code === "pts-br"
  switch (key) {
    case "price": return { text: money(q.price, code), copy: String(q.price) }
    case "prev": return q.prev === null ? null : { text: money(q.prev, code), copy: String(+q.prev.toFixed(4)) }
    case "open": return q.open === null ? null : { text: money(q.open, code), copy: String(q.open) }
    case "day": return q.dayLow === null ? null : { text: money(q.dayLow, code) + " – " + money(q.dayHigh, code), copy: q.dayLow + " - " + q.dayHigh }
    case "year": return q.yearLow === null ? null : { text: money(q.yearLow, code) + " – " + money(q.yearHigh, code), copy: q.yearLow + " - " + q.yearHigh }
    case "d1": case "d7": case "d30": case "ytd": case "y1":
      return q[key] === null ? null : { text: percent(q[key], br), copy: q[key].toFixed(2) + "%", tone: q[key] > 0 ? "up" : (q[key] < 0 ? "down" : "") }
    case "mcap": return q.mcap === null ? null : { text: compact(q.mcap, code), copy: String(q.mcap) }
    case "pe": return q.pe === null ? null : { text: number(q.pe, 2, br), copy: q.pe.toFixed(2) }
    case "dy": return q.dy === null ? null : { text: number(q.dy, 2, br) + "%", copy: q.dy.toFixed(2) + "%" }
    case "eps": return q.eps === null ? null : { text: money(q.eps, code), copy: String(q.eps) }
    case "volume": return q.volume === null ? null : { text: compact(q.volume, br ? "pts-br" : "pts"), copy: String(q.volume) }
    case "exchange": return q.exchange ? { text: q.exchange, copy: q.exchange } : null
  }
  return null
}

function timeLabel(q) {
  var d = new Date(q.time * 1000)
  var pad = function(n) { return (n < 10 ? "0" : "") + n }
  var label = pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes())
  return q.marketState === "REGULAR" ? "Open · " + label : "Closed · " + label
}

function googleUrl(q) {
  var id = GOOGLE_INDICES[q.symbol]
  if (!id && /-USD$/.test(q.symbol)) id = q.symbol
  if (!id && GOOGLE_EXCHANGES[q.exchangeCode]) id = q.symbol.replace(/\.SA$/, "") + ":" + GOOGLE_EXCHANGES[q.exchangeCode]
  return id ? "https://www.google.com/finance/quote/" + encodeURIComponent(id) : "https://finance.yahoo.com/quote/" + encodeURIComponent(q.symbol)
}

// What a quote's numbers are in: its currency, or points for an index.
function unitOf(q) {
  if (q.type === "INDEX") return q.exchangeCode === "SAO" ? "pts-br" : "pts"
  return q.currency
}

// The root-search card for a quote: {card, title}. The card's `cardData`
// (JSON, drawn by ui/ResultRow.qml) holds the sparkline, chips and stats.
// `rates` is the calculator's {rates: {CODE: per EUR}} for "em brl".
function rows(q, parsed, rates) {
  var code = unitOf(q)
  var br = code === "BRL" || code === "pts-br"
  var factor = 1
  var table = rates && rates.rates
  if (parsed.target && parsed.target !== code && table && table[code] && table[parsed.target]) {
    factor = table[parsed.target] / table[code]
    code = parsed.target
    br = code === "BRL"
  }
  var shown = factor === 1 ? q : scaled(q, factor)

  var value
  var valueCaption = ""
  var copy
  if (parsed.indicator) {
    var ind = indicator(parsed.indicator === "volume" || parsed.indicator === "exchange" ? q : shown, parsed.indicator, code)
    value = ind ? ind.text : "—"
    copy = ind ? ind.copy : ""
    valueCaption = LABELS[parsed.indicator]
  } else {
    var total = shown.price * parsed.shares
    value = money(total, code)
    copy = String(+total.toFixed(4))
    if (parsed.shares !== 1) valueCaption = number(parsed.shares, parsed.shares % 1 ? 2 : 0, br) + " × " + money(shown.price, code)
  }

  var chips = ["d7", "d30", "ytd", "y1"].filter(function(k) { return q[k] !== null }).map(function(k) {
    return { label: { d7: "7D", d30: "30D", ytd: "YTD", y1: "1Y" }[k], text: percent(q[k], br), tone: q[k] > 0 ? "up" : (q[k] < 0 ? "down" : "") }
  })
  var stats = []
  if (shown.yearLow !== null) stats.push({ label: "52W", text: number(shown.yearLow, rangeDecimals(shown.yearHigh), br) + " – " + number(shown.yearHigh, rangeDecimals(shown.yearHigh), br) })
  if (shown.mcap !== null) stats.push({ label: "Mkt cap", text: compact(shown.mcap, code) })
  if (q.pe !== null) stats.push({ label: "P/E", text: number(q.pe, q.pe >= 100 ? 1 : 2, br) })
  if (q.dy !== null) stats.push({ label: "DY", text: number(q.dy, 2, br) + "%" })
  if (!stats.length && q.volume !== null) stats.push({ label: "Avg vol", text: compact(q.volume, br ? "pts-br" : "pts") })

  var data = {
    ticker: DISPLAY_NAMES[q.symbol] || q.symbol.replace(/\.SA$/, "") || parsed.ticker,
    name: [q.name || q.symbol, q.exchange].filter(function(x) { return x }).join(" · ") + (factor !== 1 ? " · in " + code : ""),
    value: value,
    valueCaption: valueCaption,
    change: q.d1 === null ? "" : "1D " + percent(q.d1, br),
    tone: q.d1 > 0 ? "up" : (q.d1 < 0 ? "down" : ""),
    time: timeLabel(q),
    spark: q.history,
    sparkLabel: "3M",
    sparkTone: q.history.length > 1 && q.history[q.history.length - 1] < q.history[0] ? "down" : "up",
    chips: chips,
    stats: stats
  }
  var card = {
    id: "stock:" + q.symbol,
    type: "stock",
    kind: "stock",
    title: value,
    subtitle: parsed.ticker,
    typeLabel: "Stock",
    glyph: "\uf201",                     // Nerd Font line chart
    card: true,
    cardData: JSON.stringify(data),
    tone: data.tone,
    copy: copy,
    url: googleUrl(q),
    rootSearch: { when: "searching" }
  }
  return { card: card, title: parsed.ticker + (q.exchange ? " · " + q.exchange : "") }
}

function scaled(q, factor) {
  var out = {}
  for (var k in q) out[k] = q[k]
  ;["price", "prev", "open", "dayLow", "dayHigh", "yearLow", "yearHigh", "mcap", "eps"].forEach(function(k) {
    if (out[k] !== null) out[k] = out[k] * factor
  })
  return out
}

// A card when Yahoo has nothing for an explicit query ("stock asdf").
function missingCard(parsed) {
  return {
    id: "stock:" + parsed.symbol, type: "stock", kind: "stock",
    title: "—", subtitle: parsed.ticker, typeLabel: "Stock", glyph: "\uf201", card: true,
    cardData: JSON.stringify({ ticker: parsed.ticker, name: "No match on Yahoo Finance", value: "—", valueCaption: "", change: "", tone: "", time: "Try the ticker, e.g. BRK-B or ITUB4", spark: [], chips: [], stats: [] }),
    tone: "", copy: "", url: "https://finance.yahoo.com/lookup?s=" + encodeURIComponent(parsed.ticker),
    rootSearch: { when: "searching" }
  }
}

// A card while the quote loads, so the row appears at once.
function loadingCard(parsed) {
  return {
    id: "stock:" + parsed.symbol, type: "stock", kind: "stock",
    title: "…", subtitle: parsed.ticker, typeLabel: "Stock", glyph: "", card: true,
    cardData: JSON.stringify({ ticker: parsed.ticker, name: "Fetching quote…", value: "…", valueCaption: "", change: "", tone: "", time: "Yahoo Finance", spark: [], chips: [], stats: [] }),
    tone: "", copy: "", url: "",
    rootSearch: { when: "searching" }
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    parse: parse,
    normalize: normalize,
    rows: rows,
    loadingCard: loadingCard,
    missingCard: missingCard,
    indicator: indicator,
    money: money,
    compact: compact,
    percent: percent,
    googleUrl: googleUrl,
    LABELS: LABELS
  }
}
