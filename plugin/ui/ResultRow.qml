import QtQuick
import Quickshell
import qs.Commons
import qs.Commons as Commons
import "../core/FileSearch.js" as FileSearch

// One list row (SPEC §10.2): 22 px icon, title, secondary subtitle, and right
// accessories in Raycast's order: alias badge, ✓ state, type label. Section
// headers use the same delegate with rowKind "section". The calculator answer
// (core/Calc.js) draws as a card instead: expression → answer, Spotlight-style.
Item {
  id: row

  required property int index
  required property string rowKind
  required property string itemId
  required property string title
  required property string subtitle
  required property string glyph
  required property string glyphFont
  required property string iconName
  required property string typeLabel
  required property string alias
  required property bool checked
  required property bool disabled
  required property bool favorite
  required property string path         // file rows only; makes the row draggable
  required property string leftCaption  // card rows only (calculator, stock)
  required property string rightCaption
  required property bool card
  required property string cardData     // stock card JSON (core/Stocks.js); "" for other rows
  required property string tone         // "up" / "down": green / red value

  property bool selected: false
  property var look: null
  property var appLibrary: null
  property real zoom: 1

  signal hovered(int index, var item, var mouse)
  signal clicked(int index)
  signal dragStarted(int index)
  signal dragEnded(bool dropped)

  readonly property bool isSection: row.rowKind === "section"
  readonly property bool isStock: row.cardData.length > 0
  readonly property bool isCalculator: row.card && !row.isStock
  readonly property var stockInfo: {
    if (!row.isStock) return ({})
    try { return JSON.parse(row.cardData) } catch (e) { return ({}) }
  }
  readonly property color upColor: "#4caf7d"            // [D] the theme has no green
  readonly property color downColor: Commons.Color.urgent
  function toneColor(fallback) { return row.tone === "up" ? row.upColor : (row.tone === "down" ? row.downColor : fallback) }
  function px(v) { return Math.round(Style.space(v) * row.zoom) }

  width: ListView.view ? ListView.view.width : 0
  height: row.isSection ? (row.title ? px(30) : px(6)) : (row.isStock ? px(160) : (row.isCalculator ? px(112) : px(42)))

  Text {
    visible: row.isSection && row.title.length > 0
    textFormat: Text.PlainText
    anchors.left: parent.left
    anchors.leftMargin: row.px(12)
    anchors.bottom: parent.bottom
    anchors.bottomMargin: row.px(6)
    text: row.title
    color: row.look.foreground
    opacity: 0.5
    font.family: row.look.fontFamily
    font.pixelSize: Math.round(Style.font.caption * row.zoom)
    font.weight: Font.DemiBold
  }

  Rectangle {
    visible: !row.isSection
    anchors.fill: parent
    radius: Math.max(Style.cornerRadius, row.px(6))
    color: row.selected ? row.look.selectedBackground : "transparent"
    opacity: row.disabled ? 0.45 : 1

    StockCard {
      visible: row.isStock
      anchors.fill: parent
      anchors.margins: row.px(6)
      info: row.stockInfo
      look: row.look
      zoom: row.zoom
      selected: row.selected
      upColor: row.upColor
      downColor: row.downColor
    }

    // ---------------------------------------------------- calculator card
    Item {
      id: calcCard
      visible: row.isCalculator
      anchors.fill: parent
      anchors.margins: row.px(6)

      Rectangle {
        anchors.fill: parent
        radius: Math.max(Style.cornerRadius, row.px(6))
        color: "transparent"
        border.width: 1
        border.color: Util.alpha(row.look.foreground, row.selected ? 0.18 : 0.1)
      }

      Rectangle {
        id: calcDivider
        width: 1
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.margins: row.px(14)
        color: Util.alpha(row.look.foreground, 0.12)
      }

      Rectangle {
        anchors.centerIn: calcDivider
        width: row.px(28)
        height: width
        radius: width / 2
        color: row.look.background
        border.width: 1
        border.color: Util.alpha(row.look.foreground, 0.15)
        Text {
          anchors.centerIn: parent
          textFormat: Text.PlainText
          text: "→"
          color: row.look.foreground
          opacity: 0.6
          font.family: row.look.fontFamily
          font.pixelSize: row.px(14)
        }
      }

      Repeater {
        model: [
          { value: row.subtitle, caption: row.leftCaption, strong: false, tone: false },
          { value: row.title, caption: row.rightCaption, strong: true, tone: true }
        ]
        delegate: Column {
          required property var modelData
          required property int index
          x: index === 0 ? 0 : calcCard.width / 2
          width: calcCard.width / 2
          anchors.verticalCenter: parent.verticalCenter
          spacing: row.px(6)

          Text {
            width: parent.width - row.px(48)
            anchors.horizontalCenter: parent.horizontalCenter
            horizontalAlignment: Text.AlignHCenter
            textFormat: Text.PlainText
            text: modelData.value
            color: modelData.strong && row.selected ? row.look.accent : row.look.foreground
            font.family: row.look.fontFamily
            font.pixelSize: Math.round(Style.font.heading * 1.35 * row.zoom)
            font.weight: modelData.strong ? Font.DemiBold : Font.Normal
            fontSizeMode: Text.HorizontalFit
            minimumPixelSize: Math.round(Style.font.body * row.zoom)
            elide: Text.ElideMiddle
          }

          Text {
            width: parent.width - row.px(24)
            anchors.horizontalCenter: parent.horizontalCenter
            horizontalAlignment: Text.AlignHCenter
            textFormat: Text.PlainText
            text: modelData.caption
            color: modelData.tone ? row.toneColor(row.look.foreground) : row.look.foreground
            opacity: modelData.tone && row.tone ? 0.9 : 0.5
            font.family: row.look.fontFamily
            font.pixelSize: Math.round(Style.font.caption * row.zoom)
            elide: Text.ElideRight
          }
        }
      }
    }

    Item {
      id: iconBox
      visible: !row.card
      width: row.px(22)
      height: row.px(22)
      anchors.left: parent.left
      anchors.leftMargin: row.px(12)
      anchors.verticalCenter: parent.verticalCenter

      Image {
        anchors.fill: parent
        visible: row.iconName.length > 0 && row.glyph.length === 0
        fillMode: Image.PreserveAspectFit
        asynchronous: true
        sourceSize.width: width * Screen.devicePixelRatio
        sourceSize.height: height * Screen.devicePixelRatio
        source: !visible ? "" : (row.appLibrary ? row.appLibrary.iconSource(row.iconName) : Quickshell.iconPath(row.iconName, "application-x-executable"))
      }

      Text {
        anchors.centerIn: parent
        visible: row.glyph.length > 0
        textFormat: Text.PlainText
        text: row.glyph
        color: row.selected ? row.look.accent : row.look.foreground
        font.family: row.glyphFont || row.look.fontFamily
        font.pixelSize: row.glyphFont === "omarchy" ? row.px(14) : row.px(17)
      }
    }

    Row {
      id: accessories
      visible: !row.card
      anchors.right: parent.right
      anchors.rightMargin: row.px(12)
      anchors.verticalCenter: parent.verticalCenter
      spacing: row.px(10)

      Rectangle {
        visible: row.alias.length > 0
        anchors.verticalCenter: parent.verticalCenter
        height: aliasText.implicitHeight + row.px(4)
        width: aliasText.implicitWidth + row.px(12)
        radius: row.px(4)
        color: "transparent"
        border.width: 1
        border.color: Util.alpha(row.look.foreground, 0.3)
        Text {
          id: aliasText
          anchors.centerIn: parent
          textFormat: Text.PlainText
          text: row.alias
          color: row.look.foreground
          opacity: 0.7
          font.family: row.look.fontFamily
          font.pixelSize: Math.round(Style.font.caption * row.zoom)
        }
      }

      Text {
        visible: row.favorite
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: ""
        color: row.look.accent
        opacity: 0.8
        font.family: row.look.fontFamily
        font.pixelSize: Math.round(Style.font.caption * row.zoom)
      }

      Text {
        visible: row.checked
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: "✓"
        color: row.look.accent
        font.family: row.look.fontFamily
        font.pixelSize: Math.round(Style.font.body * row.zoom)
      }

      Text {
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: row.typeLabel
        color: row.look.foreground
        opacity: 0.45
        font.family: row.look.fontFamily
        font.pixelSize: Math.round(Style.font.bodySmall * row.zoom)
      }
    }

    Row {
      visible: !row.card
      anchors.left: iconBox.right
      anchors.leftMargin: row.px(10)
      anchors.right: accessories.left
      anchors.rightMargin: row.px(10)
      anchors.verticalCenter: parent.verticalCenter
      spacing: row.px(8)
      clip: true

      Text {
        id: titleText
        textFormat: Text.PlainText
        text: row.title
        color: row.toneColor(row.look.foreground)
        font.family: row.look.fontFamily
        font.pixelSize: Math.round(Style.font.title * row.zoom)
        elide: Text.ElideRight
        width: Math.min(implicitWidth, parent.width)
      }

      Text {
        textFormat: Text.PlainText
        text: row.subtitle
        visible: text.length > 0
        color: row.look.foreground
        opacity: 0.5
        font.family: row.look.fontFamily
        font.pixelSize: Math.round(Style.font.body * row.zoom)
        anchors.baseline: titleText.baseline
        elide: Text.ElideRight
        width: Math.max(0, Math.min(implicitWidth, parent.width - titleText.width - parent.spacing))
      }
    }
  }

  // Drag a file row out to another app (terminal, browser upload, chat)
  // as text/uri-list, the same payload a file manager sends. [D]
  Item {
    id: dragProxy
    width: 1
    height: 1
    Drag.dragType: Drag.Automatic
    Drag.supportedActions: Qt.CopyAction
    Drag.mimeData: row.path ? ({ "text/uri-list": FileSearch.fileUri(row.path) + "\r\n", "text/plain": row.path }) : ({})
    Drag.active: rowMouse.drag.active
    Drag.onDragStarted: row.dragStarted(row.index)
    Drag.onDragFinished: function(dropAction) {
      dragProxy.x = 0
      dragProxy.y = 0
      row.dragEnded(dropAction !== Qt.IgnoreAction)
    }
  }

  MouseArea {
    id: rowMouse
    anchors.fill: parent
    enabled: !row.isSection
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    drag.target: row.path ? dragProxy : null
    drag.threshold: row.px(8)
    onPositionChanged: function(mouse) { if (!drag.active) row.hovered(row.index, row, mouse) }
    onClicked: row.clicked(row.index)
  }
}
