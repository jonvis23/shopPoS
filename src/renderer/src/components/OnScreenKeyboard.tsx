import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { XIcon } from './Icons'

// A touch keyboard for running the till without a physical keyboard. It attaches
// itself to whatever input the user focuses (no per-field wiring needed) and
// drives it through the native value setter so React's controlled inputs see the
// change exactly as if it had been typed.
//
// It docks to the bottom edge rather than floating over the screen: while open it
// publishes its height as the `--osk-height` CSS variable, and every full-height
// container (the app shell, the login screen, each modal/drawer overlay) reserves
// that space with `pb-[var(--osk-height,0px)]`. Because Tailwind sets
// `box-sizing: border-box` globally, that padding *shrinks* those containers
// instead of overflowing them — so content is pushed up and stays fully visible
// rather than being buried under the keyboard.
//
// A physical keyboard keeps working throughout — this never intercepts real key
// events, it only adds an extra way to enter the same characters.

type Layout = 'letters' | 'numeric'

const LETTER_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]

const NUMERIC_ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['.', '0', '-'],
]

const OSK_HEIGHT_VAR = '--osk-height'

type EditableElement = HTMLInputElement | HTMLTextAreaElement

// Inputs a user can actually type into. readOnly fields are skipped on purpose —
// that's how the Sell screen's quantity/amount boxes (driven by their own fixed
// keypad) stay out of this keyboard's way without needing an explicit opt-out.
const EXCLUDED_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'file',
  'range',
  'color',
  'image',
  'hidden',
])

function isEditable(element: Element | null): element is EditableElement {
  if (!element) return false
  const tag = element.tagName
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false
  const field = element as EditableElement
  if (field.readOnly || field.disabled) return false
  if (tag === 'INPUT' && EXCLUDED_INPUT_TYPES.has((field as HTMLInputElement).type)) return false
  if (element.closest('[data-osk="off"]')) return false
  return true
}

function layoutFor(field: EditableElement): Layout {
  if (field.tagName === 'TEXTAREA') return 'letters'
  const input = field as HTMLInputElement
  const inputMode = input.getAttribute('inputmode')
  if (inputMode === 'numeric' || inputMode === 'decimal' || inputMode === 'tel') return 'numeric'
  if (input.type === 'number' || input.type === 'tel') return 'numeric'
  return 'letters'
}

// React tracks controlled <input> values on the DOM node itself, so assigning
// `.value` directly is silently reverted on the next render. Going through the
// prototype's setter (which React's tracker doesn't shadow) and then dispatching
// a bubbling 'input' event makes React handle it as genuine user input.
function setNativeValue(field: EditableElement, value: string): void {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter?.call(field, value)
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

function replaceSelection(field: EditableElement, text: string): void {
  const start = field.selectionStart ?? field.value.length
  const end = field.selectionEnd ?? field.value.length
  setNativeValue(field, field.value.slice(0, start) + text + field.value.slice(end))
  const caret = start + text.length
  field.setSelectionRange(caret, caret)
}

function deleteBackwards(field: EditableElement): void {
  const start = field.selectionStart ?? field.value.length
  const end = field.selectionEnd ?? field.value.length
  if (start !== end) {
    setNativeValue(field, field.value.slice(0, start) + field.value.slice(end))
    field.setSelectionRange(start, start)
    return
  }
  if (start === 0) return
  setNativeValue(field, field.value.slice(0, start - 1) + field.value.slice(start))
  field.setSelectionRange(start - 1, start - 1)
}

interface OnScreenKeyboardProps {
  enabled: boolean
}

export function OnScreenKeyboard({ enabled }: OnScreenKeyboardProps) {
  const [field, setField] = useState<EditableElement | null>(null)
  const [layout, setLayout] = useState<Layout>('letters')
  const [shifted, setShifted] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    setField(null)
    setShifted(false)
    setCapsLock(false)
  }, [])

  useEffect(() => {
    if (!enabled) {
      close()
      return
    }

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as Element | null
      // Focus landing on a button or the page body deliberately does NOT close the
      // keyboard. Collapsing here would reflow the whole screen (the drawer's
      // height is reserved padding) *between* the press and the release of the
      // very tap that moved focus — the control slides out from under the finger
      // and the tap is lost. A docked keyboard stays until it's dismissed: Hide,
      // Done, Escape, or the field it was editing going away.
      if (!isEditable(target)) return
      setField(target)
      setLayout(layoutFor(target))
      setShifted(false)
    }

    document.addEventListener('focusin', handleFocusIn)
    return () => document.removeEventListener('focusin', handleFocusIn)
  }, [enabled, close])

  // The one automatic close: whatever was being typed into has left the page (a
  // modal closed, a row was removed), so there is nothing left to type into.
  // This watches the DOM rather than listening for focusout because Chromium does
  // not fire a focus event when the focused element is simply removed — relying on
  // one would leave the drawer open, docked, and pointing at nothing.
  useEffect(() => {
    if (!field) return
    const observer = new MutationObserver(() => {
      if (!document.contains(field)) close()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [field, close])

  // Publish the drawer's real rendered height so every full-height container can
  // reserve exactly that much room. Measured rather than hard-coded so it stays
  // correct under the app's display-zoom setting.
  useLayoutEffect(() => {
    const root = document.documentElement
    const clear = () => root.style.setProperty(OSK_HEIGHT_VAR, '0px')

    if (!field || !panelRef.current) {
      clear()
      return clear
    }

    const panel = panelRef.current
    const publish = () => root.style.setProperty(OSK_HEIGHT_VAR, `${panel.offsetHeight}px`)
    publish()

    const observer = new ResizeObserver(publish)
    observer.observe(panel)
    return () => {
      observer.disconnect()
      clear()
    }
  }, [field, layout])

  useEffect(() => {
    if (!field) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [field, close])

  if (!enabled || !field) return null

  const press = (action: () => void) => {
    action()
    if (shifted && !capsLock) setShifted(false)
  }

  const typeText = (text: string) => press(() => replaceSelection(field, text))

  const keyClass =
    'flex h-10 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-100 hover:bg-slate-200 active:scale-95 active:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 dark:active:bg-slate-600'
  const wideKeyClass = keyClass.replace('text-sm', 'text-xs')

  const rows = layout === 'letters' ? LETTER_ROWS : NUMERIC_ROWS
  const uppercase = shifted || capsLock

  return (
    <div
      ref={panelRef}
      // Pointer-down must never move focus away from the field being edited,
      // otherwise the first key press would blur it and close the keyboard.
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={(event) => event.preventDefault()}
      // z-index sits above every overlay (modals z-50, ZReportModal z-[60]) so the
      // keys stay clickable while a modal is open.
      className="fixed inset-x-0 bottom-0 z-[80] border-t border-slate-200 bg-white px-3 pb-2 pt-1.5 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-900"
      role="group"
      aria-label="On-screen keyboard"
    >
      <div className={`mx-auto ${layout === 'numeric' ? 'max-w-xs' : 'max-w-3xl'}`}>
        <div className="mb-1.5 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {layout === 'numeric' ? 'Numbers' : 'Keyboard'}
          </span>
          <button
            type="button"
            onClick={close}
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Hide keyboard"
          >
            Hide <XIcon width={13} height={13} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex justify-center gap-1.5">
              {rowIndex === 3 && layout === 'letters' && (
                <button
                  type="button"
                  onClick={() => (capsLock ? (setCapsLock(false), setShifted(false)) : setShifted((s) => !s))}
                  onDoubleClick={() => setCapsLock(true)}
                  className={`${wideKeyClass} w-16 shrink-0 ${
                    uppercase ? '!bg-emerald-500 !text-white hover:!bg-emerald-600' : ''
                  }`}
                  aria-pressed={uppercase}
                >
                  {capsLock ? 'CAPS' : 'Shift'}
                </button>
              )}
              {row.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => typeText(uppercase && layout === 'letters' ? key.toUpperCase() : key)}
                  className={`${keyClass} ${layout === 'numeric' ? 'h-11 flex-1' : 'w-[46px] shrink-0'}`}
                >
                  {uppercase && layout === 'letters' ? key.toUpperCase() : key}
                </button>
              ))}
              {rowIndex === 3 && layout === 'letters' && (
                <button
                  type="button"
                  onClick={() => press(() => deleteBackwards(field))}
                  className={`${wideKeyClass} w-16 shrink-0`}
                  aria-label="Backspace"
                >
                  ⌫
                </button>
              )}
            </div>
          ))}

          <div className="flex justify-center gap-1.5">
            {layout === 'letters' ? (
              <>
                <button type="button" onClick={() => setLayout('numeric')} className={`${wideKeyClass} w-16 shrink-0`}>
                  123
                </button>
                <button type="button" onClick={() => typeText('@')} className={`${keyClass} w-[46px] shrink-0`}>
                  @
                </button>
                <button type="button" onClick={() => typeText('.')} className={`${keyClass} w-[46px] shrink-0`}>
                  .
                </button>
                <button type="button" onClick={() => typeText(' ')} className={`${keyClass} flex-1`}>
                  space
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="flex h-10 w-20 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-xs font-semibold text-white shadow-sm transition-all duration-100 hover:bg-emerald-600 active:scale-95"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setLayout('letters')} className={`${wideKeyClass} h-11 flex-1`}>
                  ABC
                </button>
                <button
                  type="button"
                  onClick={() => press(() => deleteBackwards(field))}
                  className={`${keyClass} h-11 flex-1`}
                  aria-label="Backspace"
                >
                  ⌫
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="flex h-11 flex-1 items-center justify-center rounded-lg bg-emerald-500 text-xs font-semibold text-white shadow-sm transition-all duration-100 hover:bg-emerald-600 active:scale-95"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
