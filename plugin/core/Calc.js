// Inline calculator for root search (SPEC §7.3 "Calculator", ref 02): maths,
// unit conversion and currency conversion, like Spotlight/Raycast. [D] A small
// recursive-descent evaluator in plain JS instead of fend/libqalculate, to keep
// the plugin free of native dependencies; no eval().
//
// Grammar, loosest first:
//   sum     = product (("+" | "-") product)*      a ± b% means a ± a·b/100
//   product = unary (("*" | "/" | "×" | "÷" | "x" | "of" | "de" | "mod") unary | implicit)*
//   unary   = ("-" | "+") unary | power
//   power   = postfix ("^" | "**") unary          right-associative
//   postfix = primary ("!" | "%")*
//   primary = number | constant | function primary | "(" sum ")"
// Numbers [D]: "." or "," is the decimal mark (the ABNT2 keypad types ","),
// and Brazilian grouping is understood: "1.500" is 1500, "1.234,56" 1234.56,
// "1,234.56" 1234.56. "a % b" between two numbers is the remainder.
// Queries are folded (lower case, no accents) and plain-language Portuguese
// and English is rewritten first (naturalize): "2 vezes 3", "quanto é 2+2",
// "9 ao quadrado", "raiz de 81", "30 graus em fahrenheit", "metros quadrados".
// Superscript digits are exponents, digits right after them included: on
// ABNT2 "^" is a dead key, so typing "23^34" composes "23³4", meaning 23^34.
//
// Conversions: "<expr> <unit> to|in|em|para|= <unit>", e.g. "10 km in mi",
// "30c to f", "100 usd em brl"; with no amount it is 1 ("usd to brl"). A bare
// amount of money ("$20", "50 euros") converts to the home currency, or from
// it to USD. "libra"/"pound" is money or weight, whichever the other side is.

var ROW_ID = "calculator:result"
var HOME_CURRENCY = "BRL"            // [D] the user's currency; config later

var CONSTANTS = { pi: Math.PI, "π": Math.PI, e: Math.E, tau: 2 * Math.PI }

// Number words and magnitudes multiply like constants: "1.5k", "1,5 mil",
// "2 mi de reais", "dois mil", "meia hora". Units are matched before maths,
// so "300k to c" is still kelvin and "10 mi em km" still miles. [D]
var NUMBER_WORDS = {
  zero: 0, um: 1, uma: 1, one: 1, dois: 2, duas: 2, two: 2, tres: 3, three: 3,
  quatro: 4, four: 4, cinco: 5, five: 5, seis: 6, six: 6, sete: 7, seven: 7,
  oito: 8, eight: 8, nove: 9, nine: 9, dez: 10, ten: 10, vinte: 20, trinta: 30,
  cem: 100, meio: 0.5, meia: 0.5, half: 0.5, duzia: 12, dozen: 12,
  k: 1e3, mil: 1e3, thousand: 1e3,
  mi: 1e6, milhao: 1e6, milhoes: 1e6, million: 1e6, millions: 1e6, mm: 1e6,
  bi: 1e9, bilhao: 1e9, bilhoes: 1e9, billion: 1e9, billions: 1e9,
  tri: 1e12, trilhao: 1e12, trilhoes: 1e12, trillion: 1e12
}
for (var word in NUMBER_WORDS) CONSTANTS[word] = NUMBER_WORDS[word]

var FUNCTIONS = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  round: Math.round, floor: Math.floor, ceil: Math.ceil,
  ln: Math.log, log: Math.log10, log2: Math.log2, exp: Math.exp,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan
}

// Units: name -> [dimension, factor to the dimension's base unit, label].
// Temperatures convert through kelvin in convertUnit().
var UNITS = {}
function defineUnits(dimension, list) {
  for (var i = 0; i < list.length; i++) {
    var names = list[i][0].split(" ")
    for (var j = 0; j < names.length; j++) UNITS[names[j]] = [dimension, list[i][1], names[0]]
  }
}
defineUnits("length", [
  ["mm millimeter millimeters milimetro milimetros", 0.001], ["cm centimeter centimeters centimetro centimetros", 0.01],
  ["m meter meters metre metres metro metros", 1], ["km kilometer kilometers kilometre kilometres quilometro quilometros kilometro kilometros", 1000],
  ["in inch inches polegada polegadas", 0.0254], ["ft foot feet pe pes", 0.3048], ["yd yard yards jarda jardas", 0.9144],
  ["mi mile miles milha milhas", 1609.344], ["nmi", 1852]
])
defineUnits("mass", [
  ["mg milligram milligrams", 1e-6], ["g gram grams grama gramas", 0.001], ["kg kilogram kilograms kilo kilos quilo quilos", 1],
  ["t ton tons tonne tonnes tonelada toneladas", 1000], ["lb lbs pound pounds libra libras", 0.45359237], ["oz ounce ounces onca oncas", 0.028349523125],
  ["st stone stones", 6.35029318]
])
defineUnits("volume", [
  ["ml milliliter milliliters millilitre millilitres mililitro mililitros", 0.001], ["l liter liters litre litres litro litros", 1],
  ["gal gallon gallons galao galoes", 3.785411784], ["qt quart quarts", 0.946352946], ["pt pint pints", 0.473176473],
  ["cup cups xicara xicaras", 0.2365882365], ["floz", 0.0295735295625], ["tbsp", 0.01478676478125], ["tsp", 0.00492892159375]
])
defineUnits("area", [
  ["m2 m²", 1], ["km2 km²", 1e6], ["cm2 cm²", 1e-4], ["ha hectare hectares", 1e4],
  ["acre acres", 4046.8564224], ["ft2 ft² sqft", 0.09290304], ["mi2 mi²", 2589988.110336]
])
defineUnits("time", [
  ["ms millisecond milliseconds", 0.001], ["s sec secs second seconds segundo segundos", 1],
  ["min mins minute minutes minuto minutos", 60], ["h hr hrs hour hours hora horas", 3600],
  ["day days dia dias", 86400], ["week weeks semana semanas", 604800],
  ["month months mes meses", 2629746], ["year years yr ano anos", 31556952]
])
defineUnits("speed", [
  ["m/s mps", 1], ["km/h kmh kph", 1 / 3.6], ["mph", 0.44704], ["kn knot knots no nos", 1852 / 3600]
])
defineUnits("data", [
  ["b byte bytes", 1], ["kb kilobyte kilobytes", 1e3], ["mb megabyte megabytes", 1e6],
  ["gb gigabyte gigabytes giga gigas", 1e9], ["tb terabyte terabytes tera teras", 1e12],
  ["kib", 1024], ["mib", 1048576], ["gib", 1073741824], ["tib", 1099511627776]
])
defineUnits("temperature", [
  ["c °c celsius", 1], ["f °f fahrenheit", 1], ["k kelvin", 1]
])

// How a unit is written in answers, when not its short name.
var UNIT_LABELS = { day: "days", week: "weeks", month: "months", year: "years", c: "°C", f: "°F", k: "K", "m/s": "m/s", m2: "m²", km2: "km²", cm2: "cm²", ft2: "ft²", mi2: "mi²", b: "B", kb: "KB", mb: "MB", gb: "GB", tb: "TB", kib: "KiB", mib: "MiB", gib: "GiB", tib: "TiB" }

function unitLabel(unit, value) {
  var label = UNIT_LABELS[unit[2]] || unit[2]
  return value === 1 && /s$/.test(label) && label.length > 2 ? label.slice(0, -1) : label
}

// Conversions round like Spotlight [D]: 4 decimals, or 4 significant digits
// below 1, so 100 km is 62.1371 mi and 1 mm is 0.000001 km.
function rounded(value) {
  var abs = Math.abs(value)
  if (abs === 0 || abs >= 1) return Number(value.toFixed(4))
  return Number(value.toPrecision(4))
}

// Currency names and symbols -> ISO code. Any 3-letter code with a rate works too.
var CURRENCY_ALIASES = {
  "$": "USD", "us$": "USD", dollar: "USD", dollars: "USD", dolar: "USD", dolares: "USD",
  "r$": "BRL", real: "BRL", reais: "BRL",
  "€": "EUR", euro: "EUR", euros: "EUR",
  "£": "GBP", pound: "GBP", pounds: "GBP", libra: "GBP", libras: "GBP",
  "¥": "JPY", yen: "JPY", iene: "JPY", ienes: "JPY",
  yuan: "CNY", yuans: "CNY", "c$": "CAD", "a$": "AUD"
}
var CURRENCY_SYMBOLS = { USD: "$", BRL: "R$", EUR: "€", GBP: "£", JPY: "¥" }

var SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹"

function fold(text) {
  return String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

// Plain-language rewrites, applied to folded text [D]. Order matters: longer
// phrases first, square units before "quadrado".
var PHRASES = [
  [/^(quanto (e|eh|da|vale|custa|sao)|what is|what's|whats|calcul(ar|e|ate)|converter|converta|convert)\s+/, ""],
  [/\s*\?+$/, ""],
  // Durations: "1h30", "2h15min", "2 horas e meia".
  [/\b(\d+)\s*h\s*(\d+)(\s*min(utos?)?\b)?/g, "($1+$2/60) h"],
  [/\b(k|mil|mi|milhao|milhoes|bi|bilhao|bilhoes|tri|trilhao|trilhoes) de\b/g, "$1"],
  [/\b(\d+)\s*(horas?|h|hours?) e meia\b/g, "($1+0.5) h"],
  [/\bcolher(es)? de sopa\b/g, "tbsp"], [/\bcolher(es)? de cha\b/g, "tsp"],
  [/\b(km|quilometros?|kilometros?) (por|per|an?) hora\b/g, "km/h"], [/\bmilhas? por hora\b|\bmiles? (per|an) hour\b/g, "mph"],
  [/\bmetros? por segundo\b|\bmeters? per second\b/g, "m/s"],
  [/\b(metros?|m) quadrados?\b|\bsquare met(er|re)s?\b/g, "m2"],
  [/\b(quilometros?|kilometros?|km) quadrados?\b|\bsquare kilomet(er|re)s?\b/g, "km2"],
  [/\b(centimetros?|cm) quadrados?\b/g, "cm2"], [/\b(pes|ft) quadrados?\b|\bsquare f(ee|oo)t\b|\bsq ?ft\b/g, "ft2"],
  [/\b(milhas?|mi) quadradas?\b|\bsquare miles?\b/g, "mi2"],
  [/\b(graus?|degrees?) (celsius|fahrenheit|kelvin|c|f)\b/g, "$2"], [/\b(graus?|degrees?)\b/g, "c"],
  [/\b(por ?cento|percent)\b/g, "%"],
  [/\b(dividido por|divided by)\b/g, "/"],
  [/\b(multiplicado por|multiplied by|vezes|times)\b/g, "*"],
  [/\b(mais|plus)\b/g, "+"], [/\b(menos|minus)\b/g, "-"],
  [/\b(elevado (a|ao|à)|to the power of|na potencia( de)?)\b/g, "^"],
  [/\b(ao quadrado|squared)\b/g, "^2"], [/\b(ao cubo|cubed)\b/g, "^3"],
  [/\b(raiz cubica de|cube root of)\b/g, "cbrt "],
  [/\b(raiz quadrada de|raiz de|square root of|raiz)\b/g, "sqrt "]
]

function naturalize(text) {
  var out = fold(text).trim()
  for (var i = 0; i < PHRASES.length; i++) out = out.replace(PHRASES[i][0], PHRASES[i][1])
  return out.replace(/\s+/g, " ").trim()
}

// One numeric literal, digits and separators only (see the header). NaN when
// the grouping is malformed, like "1.2.3".
function parseNumber(raw) {
  var dots = raw.split(".").length - 1
  var commas = raw.split(",").length - 1
  if (dots && commas) {
    var decimal = raw.lastIndexOf(".") > raw.lastIndexOf(",") ? "." : ","
    var group = decimal === "." ? "," : "."
    if (raw.split(decimal).length > 2) return NaN
    var whole = raw.split(decimal)[0]
    if (!/^\d{1,3}$/.test(whole.split(group)[0]) || whole.split(group).slice(1).some(function(g) { return g.length !== 3 })) return NaN
    return parseFloat(whole.split(group).join("") + "." + raw.split(decimal)[1])
  }
  var sep = dots ? "." : (commas ? "," : "")
  if (!sep) return parseFloat(raw)
  var parts = raw.split(sep)
  if (parts.length > 2) {
    var grouped = /^\d{1,3}$/.test(parts[0]) && parts.slice(1).every(function(g) { return g.length === 3 })
    return grouped ? parseFloat(parts.join("")) : NaN
  }
  // "1.500" is Brazilian grouping, but "0.500" and "1234.500" are decimals.
  if (sep === "." && parts[1].length === 3 && /^[1-9]\d{0,2}$/.test(parts[0])) return parseFloat(parts.join(""))
  return parseFloat((parts[0] || "0") + "." + parts[1])
}

function tokenize(text) {
  var tokens = []
  var i = 0
  while (i < text.length) {
    var ch = text[i]
    if (/\s/.test(ch)) { i++; continue }
    var num = /^(\d[\d.,]*\d|\d|[.,]\d+)(e([+-]?\d+))?/i.exec(text.slice(i))
    if (num) {
      tokens.push({ type: "num", value: parseNumber(num[1]) * (num[3] ? Math.pow(10, Number(num[3])) : 1) })
      i += num[0].length
      continue
    }
    var word = /^([a-zA-Z]+|π)/.exec(text.slice(i))
    if (word) {
      tokens.push({ type: "word", value: word[0].toLowerCase() })
      i += word[0].length
      continue
    }
    var sup = /^[⁰¹²³⁴⁵⁶⁷⁸⁹]+\d*/.exec(text.slice(i))
    if (sup) {
      var digits = sup[0].replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, function(d) { return String(SUPERSCRIPTS.indexOf(d)) })
      tokens.push({ type: "op", value: "^" }, { type: "num", value: parseFloat(digits) })
      i += sup[0].length
      continue
    }
    if (text.slice(i, i + 2) === "**") { tokens.push({ type: "op", value: "^" }); i += 2; continue }
    if ("+-*/×÷^!%()".indexOf(ch) >= 0) {
      tokens.push({ type: "op", value: ch === "×" ? "*" : (ch === "÷" ? "/" : ch) })
      i++
      continue
    }
    if (ch === "−") { tokens.push({ type: "op", value: "-" }); i++; continue }
    return null
  }
  return tokens
}

// Values carry `pct` while they come straight from a postfix "%", so the sum
// rule can apply it to its left operand.
function Parser(tokens) {
  this.tokens = tokens
  this.at = 0
  this.operations = 0
}

Parser.prototype.peek = function() { return this.tokens[this.at] }

Parser.prototype.isOp = function(value) {
  var t = this.peek()
  return !!t && t.type === "op" && t.value === value
}

Parser.prototype.isWord = function(value) {
  var t = this.peek()
  return !!t && t.type === "word" && t.value === value
}

Parser.prototype.sum = function() {
  var left = this.product().v
  while (this.isOp("+") || this.isOp("-")) {
    var sign = this.peek().value === "+" ? 1 : -1
    this.at++
    this.operations++
    var right = this.product()
    left = right.pct ? left * (1 + sign * right.v) : left + sign * right.v
  }
  return { v: left, pct: false }
}

// A primary can start right after a value ("2pi", "3(4)", "2 sqrt 9").
Parser.prototype.startsPrimary = function() {
  var t = this.peek()
  if (!t) return false
  if (t.type === "num" || this.isOp("(")) return true
  // Not "e": it is also Portuguese "and", and "R$ 1.500 e…" while typing
  // "em" must not flash 1500·e. Euler's number needs an operator ("2*e").
  return t.type === "word" && t.value !== "e" && !Parser.WORD_OPS.hasOwnProperty(t.value)
}

// Word operators; "15% of 200" and "15% de 200" multiply.
Parser.WORD_OPS = { x: "*", of: "*", de: "*", mod: "mod" }

Parser.prototype.product = function() {
  var left = this.unary()
  for (;;) {
    var op
    var t = this.peek()
    if (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      op = t.value === "%" ? "mod" : t.value
      this.at++
    } else if (t && t.type === "word" && Parser.WORD_OPS.hasOwnProperty(t.value)) {
      op = Parser.WORD_OPS[t.value]
      this.at++
    } else if (this.startsPrimary()) {
      op = "*"
    } else {
      return left
    }
    this.operations++
    var right = this.unary().v
    if (op === "/") left = { v: left.v / right, pct: false }
    else if (op === "mod") left = { v: left.v - right * Math.floor(left.v / right), pct: false }
    else left = { v: left.v * right, pct: false }
  }
}

Parser.prototype.unary = function() {
  if (this.isOp("-") || this.isOp("+")) {
    var sign = this.peek().value === "-" ? -1 : 1
    this.at++
    var inner = this.unary()
    return { v: sign * inner.v, pct: inner.pct }
  }
  return this.power()
}

// Whether the token after the current one starts a number, so "7 % 3" is a
// remainder rather than 7 percent times 3.
Parser.prototype.operandAfter = function() {
  var next = this.tokens[this.at + 1]
  return !!next && (next.type === "num" || (next.type === "op" && next.value === "("))
}

Parser.prototype.power = function() {
  var base = this.postfix()
  if (!this.isOp("^")) return base
  this.at++
  this.operations++
  return { v: Math.pow(base.v, this.unary().v), pct: false }
}

Parser.prototype.postfix = function() {
  var value = this.primary()
  for (;;) {
    if (this.isOp("%") && !this.operandAfter()) {
      this.at++
      this.operations++
      value = { v: value.v / 100, pct: true }
    } else if (this.isOp("!")) {
      this.at++
      this.operations++
      value = { v: factorial(value.v), pct: false }
    } else {
      return value
    }
  }
}

Parser.prototype.primary = function() {
  var t = this.peek()
  if (!t) throw new Error("unexpected end")
  if (t.type === "num") { this.at++; return { v: t.value, pct: false } }
  if (this.isOp("(")) {
    this.at++
    var inner = this.sum()
    // A missing ")" at the very end is forgiven, as while typing "sqrt(2".
    if (this.peek()) {
      if (!this.isOp(")")) throw new Error("expected )")
      this.at++
    }
    return inner
  }
  if (t.type === "word" && CONSTANTS.hasOwnProperty(t.value)) {
    this.at++
    return { v: CONSTANTS[t.value], pct: false }
  }
  if (t.type === "word" && FUNCTIONS.hasOwnProperty(t.value)) {
    this.at++
    this.operations++
    return { v: FUNCTIONS[t.value](this.postfix().v), pct: false }
  }
  throw new Error("unexpected " + t.value)
}

function factorial(n) {
  if (n < 0 || n > 170 || Math.floor(n) !== n) return NaN
  var out = 1
  for (var i = 2; i <= n; i++) out *= i
  return out
}

// {value, operations} for an arithmetic expression, or null.
function compute(text) {
  var tokens = tokenize(text)
  if (!tokens || tokens.length === 0) return null
  var parser = new Parser(tokens)
  var result
  try {
    result = parser.sum()
  } catch (e) {
    return null
  }
  if (parser.at !== tokens.length || !isFinite(result.v)) return null
  return { value: result.v, operations: parser.operations }
}

// --------------------------------------------------------------- formatting

// Plain digits for the clipboard: up to 10 significant digits [D, as
// Spotlight], no grouping.
function plain(value, decimals) {
  if (Object.is(value, -0)) value = 0
  if (decimals !== undefined) return String(Number(value.toFixed(decimals)))
  var abs = Math.abs(value)
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return value.toExponential(9).replace(/\.?0+e/, "e")
  return String(Number(value.toPrecision(10)))
}

// Display form: the integer part grouped by threes with a narrow no-break
// space [D], which can't be mistaken for either decimal mark.
function display(value, decimals) {
  var text = decimals !== undefined ? value.toFixed(decimals) : plain(value)
  var sci = /^(-?[\d.]+)e([+-])(\d+)$/.exec(text)
  if (sci) {
    var power = (sci[2] === "-" ? "⁻" : "") + sci[3].replace(/\d/g, function(d) { return SUPERSCRIPTS[d] })
    return sci[1] + " × 10" + power
  }
  var parts = text.split(".")
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  return parts.join(".")
}

// Money with the currency's own conventions [D]: "R$ 1.500,00" for reais,
// "$ 1,500.00" for the rest.
function money(value, code) {
  var symbol = CURRENCY_SYMBOLS[code]
  var parts = Math.abs(value).toFixed(2).split(".")
  var br = code === "BRL"
  var text = (value < 0 ? "-" : "") + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, br ? "." : ",") + (br ? "," : ".") + parts[1]
  return symbol ? symbol + " " + text : text + " " + code
}

// ------------------------------------------------------------- conversions

function unitOf(name) {
  return UNITS[fold(name)] || null
}

// ISO code for a currency word or symbol, if `rates` knows it.
function currencyOf(name, rates) {
  if (!rates) return null
  var key = fold(name)
  var code = CURRENCY_ALIASES[key] || (/^[a-z]{3}$/.test(key) ? key.toUpperCase() : "")
  return code && rates.hasOwnProperty(code) ? code : null
}

function convertUnit(value, from, to) {
  if (from[0] !== to[0]) return NaN
  if (from[0] !== "temperature") return value * from[1] / to[1]
  var kelvin = from[2] === "c" ? value + 273.15 : (from[2] === "f" ? (value - 32) * 5 / 9 + 273.15 : value)
  return to[2] === "c" ? kelvin - 273.15 : (to[2] === "f" ? (kelvin - 273.15) * 9 / 5 + 32 : kelvin)
}

var UNIT_TOKEN = "([a-zA-Z°$€£¥][a-zA-Z0-9°²/$]*)"
var TARGET = new RegExp("^(.*?)\\s+(?:to|in|into|em|para|pra|=|->|→)\\s+" + UNIT_TOKEN + "$", "i")
var TRAILING_UNIT = new RegExp("^(.*?)\\s*" + UNIT_TOKEN + "$")
// A leading symbol ("$20", "R$ 300", "€5") stands in for a trailing unit.
var PREFIXED = /^(r\$|us\$|\$|€|£|¥)\s*(.+)$/i

// {kind, value, text, copy, expression} for "<expr> <unit> to <unit>", or for
// a bare amount of money. `rates` maps ISO codes to units per EUR.
function conversion(text, rates) {
  var prefix = PREFIXED.exec(text)
  var amount = prefix ? prefix[2] : text
  var fromName = prefix ? prefix[1] : ""
  var toName = ""
  var target = TARGET.exec(amount)
  if (target) { amount = target[1]; toName = target[2] }
  if (!fromName) {
    var tail = TRAILING_UNIT.exec(amount)
    if (!tail) return null
    amount = tail[1]
    fromName = tail[2]
  }
  // No amount means one, but only with a target: "usd to brl", not "usd".
  var n = /\S/.test(amount) ? compute(amount) : (toName ? { value: 1 } : null)
  if (!n) return null

  var fromCurrency = currencyOf(fromName, rates)
  var toCurrency = toName ? currencyOf(toName, rates) : (fromCurrency === HOME_CURRENCY ? "USD" : HOME_CURRENCY)
  if (fromCurrency && toCurrency) {
    var converted = n.value / rates[fromCurrency] * rates[toCurrency]
    return {
      kind: "currency", value: converted,
      text: money(converted, toCurrency), copy: plain(converted, 2),
      expression: money(n.value, fromCurrency) + " → " + toCurrency
    }
  }
  if (!toName) return null
  var from = unitOf(fromName)
  var to = unitOf(toName)
  if (!from || !to) return null
  var value = convertUnit(n.value, from, to)
  if (!isFinite(value)) return null
  value = rounded(value)
  return {
    kind: "unit", value: value,
    text: display(value) + " " + unitLabel(to, value), copy: plain(value),
    expression: display(n.value) + " " + unitLabel(from, n.value) + " → " + unitLabel(to, 2)
  }
}

// ------------------------------------------------------------------ entry

// The answer for a query, or null when it isn't a calculation. Plain maths
// needs an operation, so "42" or "pi" alone stay ordinary searches.
// `rates` (optional) is {date, rates: {CODE: per EUR}} for currencies.
function evaluate(query, rates) {
  var original = String(query || "").trim().replace(/\s*=\s*$/, "")
  var text = naturalize(original)
  if (!text) return null
  var table = rates && rates.rates ? rates.rates : null
  var converted = conversion(text, table)
  if (converted) {
    if (converted.kind === "currency" && rates.date) converted.note = "ECB rate of " + rates.date
    return converted
  }
  var n = compute(text)
  if (!n || n.operations === 0) return null
  return { kind: "math", expression: original, value: n.value, text: display(n.value), copy: plain(n.value) }
}

// The root-search row for an answer (RootSearch.rootSections puts it on top).
function candidate(answer) {
  return {
    id: ROW_ID,
    type: "calculator",
    kind: "calculator",
    title: answer.text,
    subtitle: answer.expression,
    typeLabel: answer.kind === "currency" ? "Currency" : (answer.kind === "unit" ? "Conversion" : "Calculator"),
    // Captions under each side of the calculator card (ui/ResultRow.qml).
    leftCaption: answer.kind === "currency" ? "Currency" : (answer.kind === "unit" ? "Unit conversion" : "Expression"),
    rightCaption: answer.note || "↵ to copy",
    glyph: "",                   // Nerd Font calculator
    copy: answer.copy,
    rootSearch: { when: "searching" }
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    ROW_ID: ROW_ID,
    HOME_CURRENCY: HOME_CURRENCY,
    tokenize: tokenize,
    naturalize: naturalize,
    parseNumber: parseNumber,
    compute: compute,
    evaluate: evaluate,
    candidate: candidate,
    plain: plain,
    display: display,
    money: money,
    fold: fold,
    CURRENCY_SYMBOLS: CURRENCY_SYMBOLS
  }
}
