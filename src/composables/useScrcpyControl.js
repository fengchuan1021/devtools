/**
 * 与 scrcpy 官方 SDK 鼠标一致：
 * 左键触摸、悬停、滚轮；右键 BACK、中键 HOME、侧键 APP_SWITCH / 通知栏。
 * Shift + 次键则把真实按键转发给设备。
 */

const TYPE_INJECT_KEYCODE = 0
const TYPE_INJECT_TOUCH = 2
const TYPE_INJECT_SCROLL = 3
const TYPE_BACK_OR_SCREEN_ON = 4
const TYPE_EXPAND_NOTIFICATION = 5
const TYPE_EXPAND_SETTINGS = 6

const ACTION_DOWN = 0
const ACTION_UP = 1
const ACTION_MOVE = 2
const ACTION_HOVER_MOVE = 7

const BUTTON_PRIMARY = 1 << 0
const BUTTON_SECONDARY = 1 << 1
const BUTTON_TERTIARY = 1 << 2
const BUTTON_BACK = 1 << 3
const BUTTON_FORWARD = 1 << 4

const POINTER_MOUSE = 0xffffffffffffffffn
const POINTER_VFINGER = 0xfffffffffffffffdn

const KEY_HOME = 3
const KEY_APP_SWITCH = 187

const BIND_CLICK = 'click'
const BIND_BACK = 'back'
const BIND_HOME = 'home'
const BIND_APP_SWITCH = 'app_switch'
const BIND_NOTIFY = 'notify'

function write16(view, offset, value) {
  view.setUint16(offset, value & 0xffff, false)
}

function write32(view, offset, value) {
  view.setInt32(offset, value | 0, false)
}

function writeU32(view, offset, value) {
  view.setUint32(offset, value >>> 0, false)
}

function write64(view, offset, value) {
  view.setBigUint64(offset, BigInt(value), false)
}

function floatToU16fp(f) {
  const u = Math.round(Math.min(1, Math.max(0, f)) * 0x10000)
  return u >= 0xffff ? 0xffff : u
}

function floatToI16fp(f) {
  const i = Math.round(Math.min(1, Math.max(-1, f)) * 0x8000)
  if (i >= 0x7fff) return 0x7fff
  return i
}

function webButtonMask(button) {
  switch (button) {
    case 0:
      return BUTTON_PRIMARY
    case 2:
      return BUTTON_SECONDARY
    case 1:
      return BUTTON_TERTIARY
    case 3:
      return BUTTON_BACK
    case 4:
      return BUTTON_FORWARD
    default:
      return 0
  }
}

function bindingFor(button, shift) {
  if (button === 0) return BIND_CLICK
  const set = shift
    ? [BIND_CLICK, BIND_CLICK, BIND_CLICK, BIND_CLICK]
    : [BIND_BACK, BIND_HOME, BIND_APP_SWITCH, BIND_NOTIFY]
  if (button === 2) return set[0]
  if (button === 1) return set[1]
  if (button === 3) return set[2]
  if (button === 4) return set[3]
  return BIND_CLICK
}

export function createScrcpyControl({ send, getCanvas, getSize, onPoint }) {
  let buttons = 0
  let vfinger = false
  let invertX = false
  let invertY = false
  let notifyClicks = 0
  let notifyAt = 0

  function size() {
    const s = getSize?.() || {}
    const canvas = getCanvas?.()
    return {
      width: s.width || canvas?.width || 0,
      height: s.height || canvas?.height || 0,
    }
  }

  function toPoint(clientX, clientY) {
    const canvas = getCanvas?.()
    const { width, height } = size()
    if (!canvas || !width || !height) return null
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const x = Math.round(((clientX - rect.left) / rect.width) * width)
    const y = Math.round(((clientY - rect.top) / rect.height) * height)
    return {
      x: Math.min(width - 1, Math.max(0, x)),
      y: Math.min(height - 1, Math.max(0, y)),
      width,
      height,
    }
  }

  function writePosition(view, offset, pos) {
    write32(view, offset, pos.x)
    write32(view, offset + 4, pos.y)
    write16(view, offset + 8, pos.width)
    write16(view, offset + 10, pos.height)
  }

  function emit(buf) {
    send?.(buf)
  }

  function injectTouch({ action, pointerId, pos, pressure, actionButton, buttons: btn }) {
    const buf = new ArrayBuffer(32)
    const view = new DataView(buf)
    view.setUint8(0, TYPE_INJECT_TOUCH)
    view.setUint8(1, action)
    write64(view, 2, pointerId)
    writePosition(view, 10, pos)
    write16(view, 22, floatToU16fp(pressure))
    writeU32(view, 24, actionButton || 0)
    writeU32(view, 28, btn || 0)
    emit(buf)
  }

  function injectScroll(pos, hscroll, vscroll) {
    const buf = new ArrayBuffer(21)
    const view = new DataView(buf)
    view.setUint8(0, TYPE_INJECT_SCROLL)
    writePosition(view, 1, pos)
    const hn = Math.min(1, Math.max(-1, hscroll / 16))
    const vn = Math.min(1, Math.max(-1, vscroll / 16))
    view.setInt16(13, floatToI16fp(hn), false)
    view.setInt16(15, floatToI16fp(vn), false)
    writeU32(view, 17, buttons)
    emit(buf)
  }

  function injectKey(action, keycode) {
    const buf = new ArrayBuffer(14)
    const view = new DataView(buf)
    view.setUint8(0, TYPE_INJECT_KEYCODE)
    view.setUint8(1, action)
    writeU32(view, 2, keycode)
    writeU32(view, 6, 0)
    writeU32(view, 10, 0)
    emit(buf)
  }

  function injectBack(action) {
    const buf = new ArrayBuffer(2)
    const view = new DataView(buf)
    view.setUint8(0, TYPE_BACK_OR_SCREEN_ON)
    view.setUint8(1, action)
    emit(buf)
  }

  function invertPoint(pos) {
    return {
      x: invertX ? pos.width - pos.x : pos.x,
      y: invertY ? pos.height - pos.y : pos.y,
      width: pos.width,
      height: pos.height,
    }
  }

  function onPointerDown(e) {
    const pos = toPoint(e.clientX, e.clientY)
    if (!pos) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }

    const mask = webButtonMask(e.button)
    const shift = e.shiftKey
    const ctrl = e.ctrlKey || e.metaKey
    const binding = bindingFor(e.button, shift)

    if (e.button === 0) {
      onPoint?.({ x: pos.x, y: pos.y })
    }

    if (binding !== BIND_CLICK) {
      if (binding === BIND_BACK) injectBack(ACTION_DOWN)
      else if (binding === BIND_HOME) injectKey(ACTION_DOWN, KEY_HOME)
      else if (binding === BIND_APP_SWITCH) injectKey(ACTION_DOWN, KEY_APP_SWITCH)
      else if (binding === BIND_NOTIFY) {
        const now = Date.now()
        if (now - notifyAt < 400) notifyClicks += 1
        else notifyClicks = 1
        notifyAt = now
        const buf = new ArrayBuffer(1)
        new DataView(buf).setUint8(0, notifyClicks < 2 ? TYPE_EXPAND_NOTIFICATION : TYPE_EXPAND_SETTINGS)
        emit(buf)
      }
      return
    }

    buttons |= mask
    injectTouch({
      action: ACTION_DOWN,
      pointerId: POINTER_MOUSE,
      pos,
      pressure: 1,
      actionButton: mask,
      buttons,
    })

    if (e.button === 0 && (ctrl || shift)) {
      invertX = ctrl !== shift
      invertY = ctrl
      vfinger = true
      injectTouch({
        action: ACTION_DOWN,
        pointerId: POINTER_VFINGER,
        pos: invertPoint(pos),
        pressure: 1,
        actionButton: 0,
        buttons: 0,
      })
    }
  }

  function onPointerMove(e) {
    const pos = toPoint(e.clientX, e.clientY)
    if (!pos) return
    if (buttons) e.preventDefault()
    injectTouch({
      action: buttons ? ACTION_MOVE : ACTION_HOVER_MOVE,
      pointerId: POINTER_MOUSE,
      pos,
      pressure: 1,
      actionButton: 0,
      buttons,
    })
    if (vfinger) {
      injectTouch({
        action: ACTION_MOVE,
        pointerId: POINTER_VFINGER,
        pos: invertPoint(pos),
        pressure: 1,
        actionButton: 0,
        buttons: 0,
      })
    }
  }

  function onPointerUp(e) {
    const pos = toPoint(e.clientX, e.clientY)
    if (!pos) return
    e.preventDefault()
    const mask = webButtonMask(e.button)
    const binding = bindingFor(e.button, e.shiftKey)

    if (binding !== BIND_CLICK) {
      if (binding === BIND_BACK) injectBack(ACTION_UP)
      else if (binding === BIND_HOME) injectKey(ACTION_UP, KEY_HOME)
      else if (binding === BIND_APP_SWITCH) injectKey(ACTION_UP, KEY_APP_SWITCH)
      return
    }

    buttons &= ~mask
    injectTouch({
      action: ACTION_UP,
      pointerId: POINTER_MOUSE,
      pos,
      pressure: 0,
      actionButton: mask,
      buttons,
    })

    if (e.button === 0 && vfinger) {
      injectTouch({
        action: ACTION_UP,
        pointerId: POINTER_VFINGER,
        pos: invertPoint(pos),
        pressure: 0,
        actionButton: 0,
        buttons: 0,
      })
      vfinger = false
    }
  }

  function onPointerCancel(e) {
    if (!buttons && !vfinger) return
    const pos = toPoint(e.clientX, e.clientY) || { x: 0, y: 0, ...size() }
    if (buttons) {
      injectTouch({
        action: ACTION_UP,
        pointerId: POINTER_MOUSE,
        pos,
        pressure: 0,
        actionButton: buttons,
        buttons: 0,
      })
    }
    if (vfinger) {
      injectTouch({
        action: ACTION_UP,
        pointerId: POINTER_VFINGER,
        pos: invertPoint(pos),
        pressure: 0,
        actionButton: 0,
        buttons: 0,
      })
    }
    buttons = 0
    vfinger = false
  }

  function onWheel(e) {
    const pos = toPoint(e.clientX, e.clientY)
    if (!pos) return
    e.preventDefault()
    const h = e.deltaX ? -Math.sign(e.deltaX) : 0
    const v = e.deltaY ? -Math.sign(e.deltaY) : 0
    if (!h && !v) return
    injectScroll(pos, h, v)
  }

  function onContextMenu(e) {
    e.preventDefault()
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onWheel,
    onContextMenu,
  }
}
