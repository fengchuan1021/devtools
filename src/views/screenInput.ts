const POINTER_MOUSE = 0xffffffffffffffffn
const POINTER_FINGER = 0xfffffffffffffffen
const POINTER_VIRTUAL = 0xfffffffffffffffdn

const ACTION_DOWN = 0
const ACTION_UP = 1
const ACTION_MOVE = 2
const ACTION_HOVER = 7

const BUTTON_PRIMARY = 1
const BUTTON_SECONDARY = 2
const BUTTON_TERTIARY = 4
const BUTTON_BACK = 8
const BUTTON_FORWARD = 16

type Point = { x: number; y: number; w: number; h: number }

const KEYS: Record<string, number> = {
  Digit0: 7,
  Digit1: 8,
  Digit2: 9,
  Digit3: 10,
  Digit4: 11,
  Digit5: 12,
  Digit6: 13,
  Digit7: 14,
  Digit8: 15,
  Digit9: 16,
  ArrowUp: 19,
  ArrowDown: 20,
  ArrowLeft: 21,
  ArrowRight: 22,
  VolumeUp: 24,
  VolumeDown: 25,
  Power: 26,
  KeyA: 29,
  KeyB: 30,
  KeyC: 31,
  KeyD: 32,
  KeyE: 33,
  KeyF: 34,
  KeyG: 35,
  KeyH: 36,
  KeyI: 37,
  KeyJ: 38,
  KeyK: 39,
  KeyL: 40,
  KeyM: 41,
  KeyN: 42,
  KeyO: 43,
  KeyP: 44,
  KeyQ: 45,
  KeyR: 46,
  KeyS: 47,
  KeyT: 48,
  KeyU: 49,
  KeyV: 50,
  KeyW: 51,
  KeyX: 52,
  KeyY: 53,
  KeyZ: 54,
  Comma: 55,
  Period: 56,
  AltLeft: 57,
  AltRight: 58,
  ShiftLeft: 59,
  ShiftRight: 60,
  Tab: 61,
  Space: 62,
  Enter: 66,
  NumpadEnter: 66,
  Backspace: 67,
  Backquote: 68,
  Minus: 69,
  Equal: 70,
  BracketLeft: 71,
  BracketRight: 72,
  Backslash: 73,
  Semicolon: 74,
  Quote: 75,
  Slash: 76,
  PageUp: 92,
  PageDown: 93,
  Escape: 111,
  Delete: 112,
  ControlLeft: 113,
  ControlRight: 114,
  CapsLock: 115,
  MetaLeft: 117,
  MetaRight: 118,
  Home: 122,
  End: 123,
  Insert: 124,
  F1: 131,
  F2: 132,
  F3: 133,
  F4: 134,
  F5: 135,
  F6: 136,
  F7: 137,
  F8: 138,
  F9: 139,
  F10: 140,
  F11: 141,
  F12: 142,
  NumLock: 143,
  Numpad0: 144,
  Numpad1: 145,
  Numpad2: 146,
  Numpad3: 147,
  Numpad4: 148,
  Numpad5: 149,
  Numpad6: 150,
  Numpad7: 151,
  Numpad8: 152,
  Numpad9: 153,
  NumpadDivide: 154,
  NumpadMultiply: 155,
  NumpadSubtract: 156,
  NumpadAdd: 157,
  NumpadDecimal: 158,
}

export type InputTarget = { socket: WebSocket | undefined; w: number; h: number }

export class ScreenInput {
  private buttons = 0
  private vfinger = false
  private invertX = false
  private invertY = false
  private shortcutDown = 0
  private lastCode = ''
  private repeats = 0
  private ctrlV: Promise<void> | null = null
  private canvas: HTMLCanvasElement | null = null
  private root: HTMLElement | null = null
  private readonly lookup: (canvas: HTMLCanvasElement) => InputTarget | null
  private readonly focused: (canvas: HTMLCanvasElement) => void
  private readonly onDown = (event: MouseEvent) => this.mouseDown(event)
  private readonly onUp = (event: MouseEvent) => this.mouseUp(event)
  private readonly onMove = (event: MouseEvent) => this.mouseMove(event)
  private readonly onWheel = (event: WheelEvent) => this.wheel(event)
  private readonly onMenu = (event: Event) => {
    if (this.canvasFrom(event)) {
      event.preventDefault()
    }
  }
  private readonly onKeyDown = (event: KeyboardEvent) => this.key(event, true)
  private readonly onKeyUp = (event: KeyboardEvent) => this.key(event, false)
  private readonly onBlur = () => this.release()

  constructor(
    lookup: (canvas: HTMLCanvasElement) => InputTarget | null,
    focused: (canvas: HTMLCanvasElement) => void,
  ) {
    this.lookup = lookup
    this.focused = focused
  }

  attach(root: HTMLElement) {
    this.detach()
    this.root = root
    root.addEventListener('mousedown', this.onDown)
    root.addEventListener('wheel', this.onWheel, { passive: false })
    root.addEventListener('contextmenu', this.onMenu)
    root.addEventListener('focusin', this.onFocusIn)
    window.addEventListener('mouseup', this.onUp)
    window.addEventListener('mousemove', this.onMove)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
  }

  detach() {
    const root = this.root
    if (root) {
      root.removeEventListener('mousedown', this.onDown)
      root.removeEventListener('wheel', this.onWheel)
      root.removeEventListener('contextmenu', this.onMenu)
      root.removeEventListener('focusin', this.onFocusIn)
    }
    window.removeEventListener('mouseup', this.onUp)
    window.removeEventListener('mousemove', this.onMove)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.release()
    this.canvas = null
    this.root = null
  }

  private onFocusIn = (event: FocusEvent) => {
    const canvas = event.target
    if (!(canvas instanceof HTMLCanvasElement) || canvas.dataset.peer === undefined) {
      return
    }
    this.use(canvas)
  }

  private canvasFrom(event: Event) {
    const target = event.target
    if (!(target instanceof HTMLCanvasElement) || target.dataset.peer === undefined) {
      return null
    }
    return target
  }

  private use(canvas: HTMLCanvasElement) {
    if (this.canvas !== canvas) {
      this.release()
      this.canvas = canvas
    }
    if (document.activeElement !== canvas) {
      canvas.focus({ preventScroll: true })
    }
    this.focused(canvas)
  }

  private target() {
    if (!this.canvas) {
      return null
    }
    return this.lookup(this.canvas)
  }

  private send(packet: Uint8Array) {
    const socket = this.target()?.socket
    if (socket && socket.readyState === WebSocket.OPEN) {
      const bytes = packet.buffer.slice(packet.byteOffset, packet.byteOffset + packet.byteLength) as ArrayBuffer
      socket.send(bytes)
    }
  }

  private point(event: MouseEvent): Point | null {
    const canvas = this.canvas
    const current = this.target()
    const w = current?.w ?? 0
    const h = current?.h ?? 0
    if (!canvas || w <= 0 || h <= 0) {
      return null
    }
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return null
    }
    const x = Math.max(0, Math.min(w, Math.round(((event.clientX - rect.left) / rect.width) * w)))
    const y = Math.max(0, Math.min(h, Math.round(((event.clientY - rect.top) / rect.height) * h)))
    return { x, y, w, h }
  }

  private mouseDown(event: MouseEvent) {
    const canvas = this.canvasFrom(event)
    if (!canvas || event.button > 4) {
      return
    }
    event.preventDefault()
    this.use(canvas)
    const place = this.point(event)
    if (!place) {
      return
    }
    if (!event.shiftKey && event.button !== 0) {
      this.shortcutDown |= 1 << event.button
      if (event.button === 2) {
        this.back(true)
      } else if (event.button === 1) {
        this.keycode(3, true, 0, 0)
      } else if (event.button === 3) {
        this.keycode(187, true, 0, 0)
      } else if (event.button === 4) {
        this.send(Uint8Array.of(event.detail >= 2 ? 6 : 5))
      }
      return
    }
    this.click(event, place, true)
  }

  private mouseUp(event: MouseEvent) {
    if (event.button > 4) {
      return
    }
    const bit = 1 << event.button
    if ((this.shortcutDown & bit) !== 0) {
      this.shortcutDown &= ~bit
      if (event.button === 2) {
        this.back(false)
      } else if (event.button === 1) {
        this.keycode(3, false, 0, 0)
      } else if (event.button === 3) {
        this.keycode(187, false, 0, 0)
      }
      return
    }
    const place = this.point(event)
    if (!place) {
      return
    }
    const held = (this.buttons & androidButton(event.button)) !== 0
    if (held || (event.button === 0 && this.vfinger)) {
      this.click(event, place, false)
    }
  }

  private mouseMove(event: MouseEvent) {
    if (!this.canvas) {
      return
    }
    const dragging = this.buttons !== 0 || this.vfinger
    if (!dragging && document.activeElement !== this.canvas) {
      return
    }
    const over = event.target === this.canvas
    if (!over && !dragging) {
      return
    }
    const place = this.point(event)
    if (!place) {
      return
    }
    const pointer = this.vfinger ? POINTER_FINGER : POINTER_MOUSE
    const action = this.buttons === 0 && !this.vfinger ? ACTION_HOVER : ACTION_MOVE
    this.touch(action, pointer, place, 1, 0, this.buttons)
    if (this.vfinger) {
      this.touch(ACTION_MOVE, POINTER_VIRTUAL, this.inverse(place), 1, 0, 0)
    }
  }

  private wheel(event: WheelEvent) {
    if (event.target !== this.canvas || document.activeElement !== this.canvas) {
      return
    }
    const place = this.point(event)
    if (!place) {
      return
    }
    event.preventDefault()
    const scale = event.deltaMode === 1 ? 1 : event.deltaMode === 2 ? 16 : 0.01
    this.scroll(place, event.deltaX * scale, -event.deltaY * scale)
  }

  private click(event: MouseEvent, place: Point, down: boolean) {
    const button = androidButton(event.button)
    if (!button) {
      return
    }
    if (down) {
      this.buttons |= button
    } else {
      this.buttons &= ~button
    }
    const ctrl = event.ctrlKey
    const shift = event.shiftKey
    const change =
      event.button === 0 && ((down && !this.vfinger && (ctrl || shift)) || (!down && this.vfinger))
    const pointer = this.vfinger || change ? POINTER_FINGER : POINTER_MOUSE
    this.touch(down ? ACTION_DOWN : ACTION_UP, pointer, place, down ? 1 : 0, button, this.buttons)
    if (!change) {
      return
    }
    if (down) {
      this.invertX = ctrl !== shift
      this.invertY = ctrl
    }
    this.touch(
      down ? ACTION_DOWN : ACTION_UP,
      POINTER_VIRTUAL,
      this.inverse(place),
      down ? 1 : 0,
      0,
      0,
    )
    this.vfinger = down
  }

  private inverse(place: Point): Point {
    return {
      x: this.invertX ? place.w - place.x : place.x,
      y: this.invertY ? place.h - place.y : place.y,
      w: place.w,
      h: place.h,
    }
  }

  private key(event: KeyboardEvent, down: boolean) {
    const active = document.activeElement
    if (!(active instanceof HTMLCanvasElement) || active.dataset.peer === undefined) {
      return
    }
    if (this.canvas !== active) {
      this.release()
      this.canvas = active
    }
    const code = event.code
    const shortcutMod =
      event.altKey ||
      event.metaKey ||
      code === 'AltLeft' ||
      code === 'AltRight' ||
      code === 'MetaLeft' ||
      code === 'MetaRight'
    if (shortcutMod) {
      event.preventDefault()
      if (code === 'AltLeft' || code === 'AltRight' || code === 'MetaLeft' || code === 'MetaRight') {
        return
      }
      this.shortcut(event, down)
      return
    }
    if (down && event.ctrlKey && !event.shiftKey && code === 'KeyV' && !event.repeat) {
      event.preventDefault()
      const pending = this.readClipboard().then((text) => {
        if (text) {
          this.setClipboard(text, false)
        }
        this.keycode(50, true, 0, metaState(event))
      })
      this.ctrlV = pending
      return
    }
    if (!down && code === 'KeyV' && this.ctrlV) {
      event.preventDefault()
      const pending = this.ctrlV
      this.ctrlV = null
      void pending.then(() => this.keycode(50, false, 0, metaState(event)))
      return
    }
    const keycode = KEYS[code]
    if (keycode === undefined) {
      return
    }
    event.preventDefault()
    this.keycode(keycode, down, event.repeat ? 1 : 0, metaState(event))
  }

  private shortcut(event: KeyboardEvent, down: boolean) {
    const shift = event.shiftKey
    const repeat = event.repeat
    if (down && !repeat) {
      this.repeats = event.code === this.lastCode ? this.repeats + 1 : 0
      this.lastCode = event.code
    }
    switch (event.code) {
      case 'KeyH':
        if (!shift && !repeat) {
          this.keycode(3, down, 0, 0)
        }
        return
      case 'KeyB':
      case 'Backspace':
        if (!shift && !repeat) {
          this.back(down)
        }
        return
      case 'KeyS':
        if (!shift && !repeat) {
          this.keycode(187, down, 0, 0)
        }
        return
      case 'KeyM':
        if (!shift && !repeat) {
          this.keycode(82, down, 0, 0)
        }
        return
      case 'KeyP':
        if (!shift && !repeat) {
          this.keycode(26, down, 0, 0)
        }
        return
      case 'KeyO':
        if (down && !repeat) {
          this.send(Uint8Array.of(10, shift ? 1 : 0))
        }
        return
      case 'ArrowUp':
        if (!shift) {
          this.keycode(24, down, repeat ? 1 : 0, 0)
        }
        return
      case 'ArrowDown':
        if (!shift) {
          this.keycode(25, down, repeat ? 1 : 0, 0)
        }
        return
      case 'KeyC':
        if (down && !shift && !repeat) {
          this.send(Uint8Array.of(8, 1))
        }
        return
      case 'KeyX':
        if (down && !shift && !repeat) {
          this.send(Uint8Array.of(8, 2))
        }
        return
      case 'KeyV':
        if (down && !repeat) {
          void this.readClipboard().then((text) => {
            if (!text) {
              return
            }
            if (shift) {
              this.injectText(text)
            } else {
              this.setClipboard(text, true)
            }
          })
        }
        return
      case 'KeyN':
        if (down && !repeat) {
          if (shift) {
            this.send(Uint8Array.of(7))
          } else if (this.repeats === 0) {
            this.send(Uint8Array.of(5))
          } else {
            this.send(Uint8Array.of(6))
          }
        }
        return
      case 'KeyR':
        if (down && !shift && !repeat) {
          this.send(Uint8Array.of(11))
        }
        return
      default:
        return
    }
  }

  private release() {
    if (this.buttons !== 0 || this.vfinger) {
      const current = this.target()
      const w = current?.w ?? 0
      const h = current?.h ?? 0
      const place = { x: 0, y: 0, w, h }
      if (w > 0) {
        this.touch(ACTION_UP, this.vfinger ? POINTER_FINGER : POINTER_MOUSE, place, 0, BUTTON_PRIMARY, 0)
        if (this.vfinger) {
          this.touch(ACTION_UP, POINTER_VIRTUAL, place, 0, 0, 0)
        }
      }
    }
    this.buttons = 0
    this.vfinger = false
    this.shortcutDown = 0
  }

  private back(down: boolean) {
    this.send(Uint8Array.of(4, down ? ACTION_DOWN : ACTION_UP))
  }

  private keycode(keycode: number, down: boolean, repeat: number, meta: number) {
    const packet = new Uint8Array(14)
    const view = new DataView(packet.buffer)
    packet[1] = down ? ACTION_DOWN : ACTION_UP
    view.setInt32(2, keycode)
    view.setInt32(6, repeat)
    view.setInt32(10, meta)
    this.send(packet)
  }

  private touch(
    action: number,
    pointer: bigint,
    place: Point,
    pressure: number,
    actionButton: number,
    buttons: number,
  ) {
    const packet = new Uint8Array(32)
    const view = new DataView(packet.buffer)
    packet[0] = 2
    packet[1] = action
    view.setBigUint64(2, pointer)
    view.setInt32(10, place.x)
    view.setInt32(14, place.y)
    view.setUint16(18, place.w)
    view.setUint16(20, place.h)
    view.setUint16(22, pressure ? 0xffff : 0)
    view.setInt32(24, actionButton)
    view.setInt32(28, buttons)
    this.send(packet)
  }

  private scroll(place: Point, horizontal: number, vertical: number) {
    const packet = new Uint8Array(21)
    const view = new DataView(packet.buffer)
    packet[0] = 3
    view.setInt32(1, place.x)
    view.setInt32(5, place.y)
    view.setUint16(9, place.w)
    view.setUint16(11, place.h)
    view.setInt16(13, fixedScroll(horizontal))
    view.setInt16(15, fixedScroll(vertical))
    view.setInt32(17, this.buttons)
    this.send(packet)
  }

  private setClipboard(text: string, paste: boolean) {
    const bytes = new TextEncoder().encode(text)
    const packet = new Uint8Array(14 + bytes.length)
    const view = new DataView(packet.buffer)
    packet[0] = 9
    packet[9] = paste ? 1 : 0
    view.setUint32(10, bytes.length)
    packet.set(bytes, 14)
    this.send(packet)
  }

  private injectText(text: string) {
    const bytes = new TextEncoder().encode(text).subarray(0, 300)
    const packet = new Uint8Array(5 + bytes.length)
    const view = new DataView(packet.buffer)
    packet[0] = 1
    view.setUint32(1, bytes.length)
    packet.set(bytes, 5)
    this.send(packet)
  }

  private async readClipboard() {
    try {
      return await navigator.clipboard.readText()
    } catch {
      return ''
    }
  }
}

function androidButton(button: number) {
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

function metaState(event: KeyboardEvent) {
  let meta = 0
  if (event.shiftKey) {
    meta |= 0x01 | 0x40
  }
  if (event.altKey) {
    meta |= 0x02 | 0x10
  }
  if (event.ctrlKey) {
    meta |= 0x1000 | 0x2000
  }
  if (event.metaKey) {
    meta |= 0x10000 | 0x20000
  }
  if (event.getModifierState('CapsLock')) {
    meta |= 0x100000
  }
  if (event.getModifierState('NumLock')) {
    meta |= 0x200000
  }
  return meta
}

function fixedScroll(notches: number) {
  const norm = Math.max(-1, Math.min(1, notches / 16))
  return Math.max(-32768, Math.min(32767, Math.round(norm * 32768)))
}
