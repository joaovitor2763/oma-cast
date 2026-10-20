import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons

// Icon lookup for when the shell gives us no appLibrary. Omarchy 4.0.6 drops
// it for third-party panels: the panel loader passes a manifest whose `kinds`
// fails Array.isArray, so manifestHasKind(manifest, "menu") is false [I].
// Mirrors AppLibrary.iconSource()/refreshIcons(): Qt's themed lookup never
// re-scans, so icons of apps installed after the shell started need a file
// index, rebuilt on every open.
Item {
  id: index

  property var icons: ({})
  property var pending: ({})

  function iconSource(icon) {
    var value = String(icon || "")
    if (value.length === 0) return Quickshell.iconPath("application-x-executable", true)
    if (value.indexOf("file://") === 0 || value.indexOf("image://") === 0) return value
    if (value.charAt(0) === "/") return Util.fileUrl(value)
    var found = index.icons[value]
    if (found) return Util.fileUrl(found)
    var themed = Quickshell.iconPath(value, true)
    if (themed.length > 0) return themed
    return Quickshell.iconPath("application-x-executable", true)
  }

  function refreshIcons() {
    if (!scan.running) scan.running = true
  }

  // Same listing as AppLibrary.iconIndexScanCommand(): app/device icons in the
  // XDG icon dirs and /usr/share/pixmaps, SVGs first so they win per name.
  Process {
    id: scan
    command: ["bash", "-c", [
      'dirs="$HOME/.icons $HOME/.local/share/icons";',
      'IFS=":"; for d in ${XDG_DATA_DIRS:-/usr/local/share:/usr/share}; do dirs="$dirs $d/icons"; done; unset IFS;',
      'for ext in svg png; do',
      '  for base in $dirs; do',
      '    [[ -d $base ]] && find "$base" \\( -path "*/apps/*" -o -path "*/devices/*" \\) -name "*.$ext" 2>/dev/null;',
      '  done;',
      '  find /usr/share/pixmaps -maxdepth 1 -name "*.$ext" 2>/dev/null;',
      'done'
    ].join(' ')]
    stdout: SplitParser {
      onRead: function(line) {
        var path = String(line || "").trim()
        var file = path.slice(path.lastIndexOf("/") + 1)
        var dot = file.lastIndexOf(".")
        var name = dot > 0 ? file.slice(0, dot) : file
        if (name.length > 0 && index.pending[name] === undefined) index.pending[name] = path
      }
    }
    onStarted: index.pending = ({})
    onExited: index.icons = index.pending
  }

  Component.onCompleted: refreshIcons()
}
