import QtQuick
import Quickshell.Io
import "../core/Stocks.js" as Stocks

// Quotes for core/Stocks.js, one symbol at a time through
// scripts/yahoo-quote. request() is cheap on every keystroke: answers are
// cached for TTL_MS, and only the newest symbol is fetched after a pause.
Item {
  id: source

  required property string script
  required property string cacheDir
  property var entries: ({})          // symbol -> {quote|null, at}
  property string wanted: ""
  property bool loading: debounce.running || proc.running
  property int revision: 0

  readonly property int ttlMs: 60 * 1000    // [D]

  signal message(string level, string text, var metadata)

  // {quote} once answered (quote null: unknown symbol or offline), else null.
  function lookup(symbol) {
    var e = source.entries[symbol]
    return e || null
  }

  function request(symbol) {
    if (!symbol) { source.wanted = ""; return }
    var e = source.entries[symbol]
    if (e && Date.now() - e.at < source.ttlMs) return
    if (symbol === source.wanted && (debounce.running || proc.running)) return
    source.wanted = symbol
    debounce.restart()
  }

  function start() {
    if (proc.running || !source.wanted) return     // onExited picks up the newest
    proc.symbol = source.wanted
    proc.command = [source.script, proc.symbol, source.cacheDir]
    proc.running = true
  }

  Timer {
    id: debounce
    interval: 300    // [D] a ticker is usually typed in one go
    onTriggered: source.start()
  }

  Process {
    id: proc
    property string symbol: ""
    stdout: StdioCollector { id: out }
    onExited: function(exitCode) {
      var quote = null
      try {
        quote = Stocks.normalize(JSON.parse(out.text), Date.now() / 1000)
      } catch (e) {
        source.message("info", "no quote for " + proc.symbol + ": " + e, null)
      }
      var next = Object.assign({}, source.entries)
      next[proc.symbol] = { quote: quote, at: Date.now() }
      source.entries = next
      source.revision++
      // The process still counts as running inside onExited; start the
      // newest wanted symbol, if it changed meanwhile, on the next tick.
      if (source.wanted && source.wanted !== proc.symbol) Qt.callLater(source.start)
    }
  }
}
