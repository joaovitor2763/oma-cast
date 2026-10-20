const test = require("node:test")
const assert = require("node:assert/strict")
const C = require("../plugin/core/Calc.js")

const RATES = { date: "2026-10-19", rates: { EUR: 1, BRL: 5.6633, USD: 1.1225, GBP: 0.84205, JPY: 177.63 } }

function answer(query, rates) {
  const a = C.evaluate(query, rates)
  return a ? a.text : null
}

test("arithmetic follows precedence, parentheses and powers", () => {
  assert.equal(answer("2 + 3 * 4"), "14")
  assert.equal(answer("(2+3)*4"), "20")
  assert.equal(answer("100 - 2 * (3 + 4)"), "86")
  assert.equal(answer("2^10"), "1 024")
  assert.equal(answer("2**3**2"), "512")
  assert.equal(answer("-2^2"), "-4")
  assert.equal(answer("10 mod 3"), "1")
  assert.equal(answer("5!"), "120")
})

test("× ÷ x and implicit multiplication", () => {
  assert.equal(answer("6 × 7"), "42")
  assert.equal(answer("84 ÷ 2"), "42")
  assert.equal(answer("3x4"), "12")
  assert.equal(answer("2(3+1)"), "8")
  assert.equal(answer("2pi"), "6.283185307")
})

test("comma or dot as the decimal mark, and scientific notation", () => {
  assert.equal(answer("1,5 * 2"), "3")
  assert.equal(answer("1.5 * 2"), "3")
  assert.equal(answer("2.5e-3 * 2"), "0.005")
  assert.equal(answer("0.1 + 0.2"), "0.3")
})

test("percentages", () => {
  assert.equal(answer("200 + 10%"), "220")
  assert.equal(answer("200 - 15%"), "170")
  assert.equal(answer("200 * 10%"), "20")
  assert.equal(answer("15% of 200"), "30")
  assert.equal(answer("15% de 200"), "30")
})

test("functions, constants and a forgiven closing paren", () => {
  assert.equal(answer("sqrt 16"), "4")
  assert.equal(answer("sqrt(2"), "1.414213562")
  assert.equal(answer("sin(pi/2)"), "1")
  assert.equal(answer("log 1000"), "3")
})

test("plain words and lone numbers are not calculations", () => {
  for (const q of ["", "42", "pi", "firefox", "2048", "x", "casa de papel", "1/0", "10 m", "2 +"]) assert.equal(answer(q), null, q)
})

test("superscript digits are exponents, as the ABNT2 dead ^ composes them", () => {
  assert.equal(answer("23³4"), answer("23^34"))
  assert.equal(answer("2¹⁰"), "1\u202f024")
  assert.equal(answer("3² + 4²"), "25")
})

test("a trailing = is ignored", () => {
  assert.equal(answer("2 + 2 ="), "4")
})

test("unit conversions round to 4 decimals and use readable labels", () => {
  assert.equal(answer("100 km in mi"), "62.1371 mi")
  assert.equal(answer("30c to f"), "86 °F")
  assert.equal(answer("98.6 f to c"), "37 °C")
  assert.equal(answer("5 kg em lb"), "11.0231 lb")
  assert.equal(answer("2 gb in mb"), "2 000 MB")
  assert.equal(answer("100 km/h to mph"), "62.1371 mph")
  assert.equal(answer("1 day in hours"), "24 h")
  assert.equal(answer("1 mm to km"), "0.000001 km")
  assert.equal(answer("10 kg to km"), null)
})

test("currencies convert by ECB rates, bare amounts to the home currency", () => {
  assert.equal(answer("100 usd in brl", RATES), "R$ 504,53")
  assert.equal(answer("100 usd", RATES), "R$ 504,53")
  assert.equal(answer("$20", RATES), "R$ 100,91")
  assert.equal(answer("50 euros", RATES), "R$ 283,16")
  assert.equal(answer("R$ 300 em usd", RATES), "$ 59.46")
  assert.equal(answer("1000 reais", RATES), "$ 198.21")
  assert.equal(answer("1 gbp to jpy", RATES), "¥ 210.95")
  assert.equal(answer("100 xyz to brl", RATES), null)
  assert.equal(answer("100 usd"), null)
  assert.match(C.evaluate("100 usd", RATES).note, /2026-10-19/)
})

test("the clipboard gets plain digits", () => {
  assert.equal(C.evaluate("1234567*1000").copy, "1234567000")
  assert.equal(C.evaluate("100 usd", RATES).copy, "504.53")
})

test("candidate is a searching-only calculator row", () => {
  const row = C.candidate(C.evaluate("2+2"))
  assert.equal(row.id, C.ROW_ID)
  assert.equal(row.kind, "calculator")
  assert.equal(row.title, "4")
  assert.equal(row.subtitle, "2+2")
  assert.equal(row.copy, "4")
})

test("no amount means one, for currencies and units alike", () => {
  assert.equal(answer("usd to brl", RATES), "R$ 5,05")
  assert.equal(answer("dolar em reais", RATES), "R$ 5,05")
  assert.equal(answer("km to mi"), "0.6214 mi")
  assert.equal(answer("usd", RATES), null, "a lone currency stays a search")
  assert.equal(answer("kg"), null)
})

test("Portuguese unit names, with or without accents", () => {
  assert.equal(answer("1 kilometro para milhas"), "0.6214 mi")
  assert.equal(answer("1 quilômetro em milhas"), "0.6214 mi")
  assert.equal(answer("6 pés em metros"), "1.8288 m")
  assert.equal(answer("2 xícaras em ml"), "473.1765 ml")
  assert.equal(answer("1 galão em litros"), "3.7854 l")
  assert.equal(answer("1 mês em dias"), "30.4369 days")
  assert.equal(answer("1 terabyte em gigabytes"), "1\u202f000 GB")
})

test("multi-word units", () => {
  assert.equal(answer("30 graus em fahrenheit"), "86 °F")
  assert.equal(answer("30 graus celsius em fahrenheit"), "86 °F")
  assert.equal(answer("100 km por hora em milhas por hora"), "62.1371 mph")
  assert.equal(answer("100 metros quadrados em pés quadrados"), "1\u202f076.391 ft²")
  assert.equal(answer("3 colheres de sopa em ml"), "44.3603 ml")
})

test("libra is money or weight, whichever the other side is", () => {
  assert.equal(answer("70 kg em libras", RATES), "154.3236 lb")
  assert.equal(answer("10 libras em kg", RATES), "4.5359 kg")
  assert.equal(answer("libra em reais", RATES), "R$ 6,73")
})

test("Brazilian and US number grouping", () => {
  assert.equal(C.parseNumber("1.500"), 1500)
  assert.equal(C.parseNumber("1.234,56"), 1234.56)
  assert.equal(C.parseNumber("1,234.56"), 1234.56)
  assert.equal(C.parseNumber("1.234.567"), 1234567)
  assert.equal(C.parseNumber("0.500"), 0.5)
  assert.equal(C.parseNumber("3,14"), 3.14)
  assert.ok(Number.isNaN(C.parseNumber("1.2.3")))
  assert.equal(answer("R$ 1.234,56 em usd", RATES), "$ 244.70")
  assert.equal(answer("1.000 + 500"), "1\u202f500")
})

test("plain-language maths in Portuguese and English", () => {
  assert.equal(answer("quanto é 2+2"), "4")
  assert.equal(answer("2 vezes 3"), "6")
  assert.equal(answer("10 dividido por 4"), "2.5")
  assert.equal(answer("5 mais 3"), "8")
  assert.equal(answer("10 menos 4"), "6")
  assert.equal(answer("2 elevado a 10"), "1\u202f024")
  assert.equal(answer("9 ao quadrado"), "81")
  assert.equal(answer("raiz de 81"), "9")
  assert.equal(answer("15 por cento de 80"), "12")
  assert.equal(answer("what is 5 times 6"), "30")
  for (const q of ["spotify mais tocadas", "1password", "7zip"]) assert.equal(answer(q), null, q)
})

test("% between two numbers is the remainder", () => {
  assert.equal(answer("7 % 3"), "1")
  assert.equal(answer("50% de 300"), "150")
})

test("half-typed conversions don't flash nonsense", () => {
  assert.equal(answer("R$ 1.500 e", RATES), null)
  assert.equal(answer("2 e"), null)
  assert.equal(answer("2*e"), "5.436563657")
})

test("magnitudes and number words", () => {
  assert.equal(answer("1.5k"), "1\u202f500")
  assert.equal(answer("1,5 mil"), "1\u202f500")
  assert.equal(answer("2 bi / 1000"), "2\u202f000\u202f000")
  assert.equal(answer("dois mais dois"), "4")
  assert.equal(answer("um dolar em reais", RATES), "R$ 5,05")
  assert.equal(answer("2 mi de reais", RATES), "$ 396,411.99")
  assert.equal(answer("300k to c"), "26.85 °C", "units win over magnitudes")
  assert.equal(answer("10 mi em km"), "16.0934 km")
  for (const q of ["dez", "um", "mil"]) assert.equal(answer(q), null, q)
})

test("durations", () => {
  assert.equal(answer("1h30 em minutos"), "90 min")
  assert.equal(answer("2h15min em minutos"), "135 min")
  assert.equal(answer("2 horas e meia em minutos"), "150 min")
  assert.equal(answer("meia hora em minutos"), "30 min")
})

test("reais use Brazilian formatting, other money US", () => {
  assert.equal(C.money(1234567.891, "BRL"), "R$ 1.234.567,89")
  assert.equal(C.money(1234567.891, "USD"), "$ 1,234,567.89")
  assert.equal(C.money(-5, "EUR"), "€ -5.00")
})
