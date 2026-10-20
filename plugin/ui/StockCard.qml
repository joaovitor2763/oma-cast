import QtQuick
import qs.Commons

// The stock card of a result row (core/Stocks.js cardData): ticker and name,
// price with the 1D change, a 3-month sparkline, 7D/30D/YTD/1Y chips and a
// line of key stats. Everything is in one row, so the list stays short.
Item {
  id: card

  property var info: ({})
  property var look: null
  property real zoom: 1
  property bool selected: false
  property color upColor: "#4caf7d"
  property color downColor: "red"

  function px(v) { return Math.round(Style.space(v) * card.zoom) }
  function toneColor(tone, fallback) { return tone === "up" ? card.upColor : (tone === "down" ? card.downColor : fallback) }
  readonly property color muted: Util.alpha(card.look.foreground, 0.55)
  readonly property int pad: px(14)

  Rectangle {
    anchors.fill: parent
    radius: Math.max(Style.cornerRadius, card.px(6))
    color: "transparent"
    border.width: 1
    border.color: Util.alpha(card.look.foreground, card.selected ? 0.18 : 0.1)
  }

  // ------------------------------------------------------------ header
  Column {
    id: head
    anchors.left: parent.left
    anchors.top: parent.top
    anchors.leftMargin: card.pad
    anchors.topMargin: card.px(10)
    width: parent.width / 2 - card.pad
    spacing: card.px(2)

    Text {
      textFormat: Text.PlainText
      text: card.info.ticker || ""
      color: card.look.foreground
      font.family: card.look.fontFamily
      font.pixelSize: Math.round(Style.font.heading * 1.2 * card.zoom)
      font.weight: Font.DemiBold
    }

    Text {
      width: parent.width
      textFormat: Text.PlainText
      text: card.info.name || ""
      color: card.muted
      font.family: card.look.fontFamily
      font.pixelSize: Math.round(Style.font.caption * card.zoom)
      elide: Text.ElideRight
    }
  }

  Column {
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.rightMargin: card.pad
    anchors.topMargin: card.px(10)
    width: parent.width / 2 - card.pad
    spacing: card.px(2)

    Text {
      anchors.right: parent.right
      width: parent.width
      horizontalAlignment: Text.AlignRight
      textFormat: Text.PlainText
      text: card.info.value || ""
      color: card.selected ? card.look.accent : card.look.foreground
      font.family: card.look.fontFamily
      font.pixelSize: Math.round(Style.font.heading * 1.2 * card.zoom)
      font.weight: Font.DemiBold
      fontSizeMode: Text.HorizontalFit
      minimumPixelSize: Math.round(Style.font.body * card.zoom)
    }

    Row {
      anchors.right: parent.right
      spacing: card.px(6)

      Text {
        textFormat: Text.PlainText
        text: card.info.valueCaption || card.info.change || ""
        color: card.info.valueCaption ? card.muted : card.toneColor(card.info.tone, card.muted)
        font.family: card.look.fontFamily
        font.pixelSize: Math.round(Style.font.caption * card.zoom)
        font.weight: card.info.valueCaption ? Font.Normal : Font.DemiBold
      }

      Text {
        textFormat: Text.PlainText
        text: "·  " + (card.info.time || "")
        visible: !!card.info.time
        color: card.muted
        font.family: card.look.fontFamily
        font.pixelSize: Math.round(Style.font.caption * card.zoom)
      }
    }
  }

  // --------------------------------------------------------- sparkline
  Canvas {
    id: spark
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.leftMargin: card.pad
    anchors.rightMargin: card.pad
    y: head.y + head.height + card.px(8)
    height: card.px(46)
    visible: points.length > 1

    property var points: card.info.spark || []
    readonly property color line: card.toneColor(card.info.sparkTone, card.look.accent)
    onPointsChanged: requestPaint()
    onLineChanged: requestPaint()
    onWidthChanged: requestPaint()
    onHeightChanged: requestPaint()

    onPaint: {
      var ctx = getContext("2d")
      ctx.reset()
      var n = points.length
      if (n < 2) return
      var lo = Math.min.apply(null, points)
      var hi = Math.max.apply(null, points)
      var span = hi - lo || 1
      var inset = 2
      function x(i) { return i * (width - 1) / (n - 1) }
      function y(v) { return inset + (1 - (v - lo) / span) * (height - inset * 2) }

      ctx.beginPath()
      ctx.moveTo(x(0), y(points[0]))
      for (var i = 1; i < n; i++) ctx.lineTo(x(i), y(points[i]))
      ctx.lineWidth = Math.max(1.5, card.px(2))
      ctx.lineJoin = "round"
      ctx.strokeStyle = line
      ctx.stroke()

      ctx.lineTo(x(n - 1), height)
      ctx.lineTo(x(0), height)
      ctx.closePath()
      var fill = ctx.createLinearGradient(0, 0, 0, height)
      fill.addColorStop(0, Qt.rgba(line.r, line.g, line.b, 0.28))
      fill.addColorStop(1, Qt.rgba(line.r, line.g, line.b, 0))
      ctx.fillStyle = fill
      ctx.fill()

      // Last close as a dot.
      ctx.beginPath()
      ctx.arc(x(n - 1), y(points[n - 1]), Math.max(2, card.px(3)), 0, Math.PI * 2)
      ctx.fillStyle = line
      ctx.fill()
    }

    Text {
      anchors.left: parent.left
      anchors.top: parent.top
      textFormat: Text.PlainText
      text: card.info.sparkLabel || ""
      color: card.muted
      font.family: card.look.fontFamily
      font.pixelSize: Math.round(Style.font.caption * 0.9 * card.zoom)
    }
  }

  // -------------------------------------------------- chips and stats
  Column {
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.leftMargin: card.pad
    anchors.rightMargin: card.pad
    anchors.bottom: parent.bottom
    anchors.bottomMargin: card.px(10)
    spacing: card.px(4)

    Row {
      spacing: card.px(18)
      Repeater {
        model: card.info.chips || []
        delegate: Row {
          required property var modelData
          spacing: card.px(5)
          Text {
            textFormat: Text.PlainText
            text: modelData.label
            color: card.muted
            font.family: card.look.fontFamily
            font.pixelSize: Math.round(Style.font.caption * card.zoom)
          }
          Text {
            textFormat: Text.PlainText
            text: modelData.text
            color: card.toneColor(modelData.tone, card.look.foreground)
            font.family: card.look.fontFamily
            font.pixelSize: Math.round(Style.font.caption * card.zoom)
            font.weight: Font.DemiBold
          }
        }
      }
    }

    Row {
      width: parent.width
      spacing: card.px(18)
      clip: true
      Repeater {
        model: card.info.stats || []
        delegate: Row {
          required property var modelData
          spacing: card.px(5)
          Text {
            textFormat: Text.PlainText
            text: modelData.label
            color: card.muted
            font.family: card.look.fontFamily
            font.pixelSize: Math.round(Style.font.caption * card.zoom)
          }
          Text {
            textFormat: Text.PlainText
            text: modelData.text
            color: card.look.foreground
            font.family: card.look.fontFamily
            font.pixelSize: Math.round(Style.font.caption * card.zoom)
          }
        }
      }
    }
  }
}
