import QtQuick
import Quickshell.Io

// Daily ECB exchange rates for the calculator (core/Calc.js), from
// frankfurter.dev [O source per ref 02; D endpoint]. Cached in
// <cache>/currency-rates.json as {date, rates: {CODE: per EUR}, fetchedAt};
// refresh() fetches only when the cache is older than MAX_AGE_MS, so calling
// it on every open is cheap. Offline, the last rates keep working.
Item {
  id: source

  required property string path
  property bool ready: false
  property var rates: null            // {date, rates, fetchedAt} or null
  property int revision: 0

  readonly property string url: "https://api.frankfurter.dev/v1/latest"
  readonly property int maxAgeMs: 6 * 3600 * 1000   // [D] ECB publishes once a day

  signal message(string level, string text, var metadata)

  function refresh() {
    if (!source.ready || fetch.running) return
    if (source.rates && Date.now() - (source.rates.fetchedAt || 0) < source.maxAgeMs) return
    fetch.running = true
  }

  onReadyChanged: if (ready) cache.reload()

  FileView {
    id: cache
    path: source.ready ? source.path : ""
    printErrors: false
    onLoaded: {
      try {
        var doc = JSON.parse(text())
        if (doc && doc.rates) { source.rates = doc; source.revision++ }
      } catch (e) {
        source.message("warning", "ignoring unreadable rates cache: " + e, null)
      }
      source.refresh()
    }
    onLoadFailed: source.refresh()
  }

  Process {
    id: fetch
    command: ["curl", "-sfL", "--max-time", "8", source.url]
    stdout: StdioCollector { id: body }
    onExited: function(exitCode) {
      if (exitCode !== 0) { source.message("info", "currency rates unavailable (curl " + exitCode + ")", null); return }
      try {
        var doc = JSON.parse(body.text)
        if (!doc.rates) throw new Error("no rates")
        doc.rates[doc.base || "EUR"] = 1
        var next = { date: String(doc.date || ""), rates: doc.rates, fetchedAt: Date.now() }
        source.rates = next
        source.revision++
        cache.setText(JSON.stringify(next))
      } catch (e) {
        source.message("warning", "could not read currency rates: " + e, null)
      }
    }
  }
}
