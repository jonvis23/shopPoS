import { useEffect, useRef } from 'react'
import type { ChangeEvent, FocusEvent, MouseEvent } from 'react'
import { formatThousands, sanitizeNumericInput } from '../../../shared/stock'

interface FormattedNumberInputProps {
  value: string
  onChange: (raw: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
  required?: boolean
  id?: string
  /** Called when the box takes focus, on top of the caret handling. */
  onFocus?: () => void
  /** Called on every click, including clicks on an already-focused box. */
  onClick?: () => void
  /**
   * Keeps the docked touch keyboard away from this box. For the Sell screen,
   * which has a permanent keypad of its own — a second one sliding up over it
   * would only steal the room the first one is standing in.
   */
  noTouchKeyboard?: boolean
}

// A money/quantity box where the caret only ever lives at the end of the number.
//
// Nothing in this till is edited mid-number — an amount is either typed left to
// right or wiped and retyped — so a caret sitting anywhere else is a trap. It
// used to be reachable two ways: clicking into the middle of "1,200" left the
// caret between the digits, and the select-on-focus that was meant to prevent
// that was cancelled by the very click that triggered it (focus fires on mouse
// down, the selection is made, then mouse up collapses it to wherever the finger
// landed). Tapping the right-hand side of a field still reading "0" therefore put
// the next digits *after* the zero: type 100, get "0,100".
//
// So: the first click selects the whole value, so typing replaces it; any later
// click, and every keystroke, parks the caret at the end.
export function FormattedNumberInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
  required,
  id,
  onFocus,
  onClick,
  noTouchKeyboard,
}: FormattedNumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  // True between the mouse down that will move focus here and that same click's
  // mouse up — the window in which the browser would throw the selection away.
  const focusedByPointer = useRef(false)
  const formatted = formatThousands(value)

  const caretToEnd = () => {
    const input = inputRef.current
    if (!input) return
    const end = input.value.length
    if (input.selectionStart !== end || input.selectionEnd !== end) {
      input.setSelectionRange(end, end)
    }
  }

  // Runs after every render, because reformatting shifts positions: adding the
  // comma to "1000" moves the end from index 4 to index 5.
  useEffect(() => {
    if (document.activeElement === inputRef.current) caretToEnd()
  })

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(sanitizeNumericInput(event.target.value))
  }

  // Recorded before focus moves, so a click on an already-focused field is told
  // apart from the click that focuses it.
  const handleMouseDown = () => {
    focusedByPointer.current = document.activeElement !== inputRef.current
  }

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.target.select()
    onFocus?.()
  }

  const handleMouseUp = (event: MouseEvent<HTMLInputElement>) => {
    if (focusedByPointer.current) {
      // Suppressing the default keeps the select-all made on focus intact, so the
      // first digit typed replaces the old amount instead of joining it.
      event.preventDefault()
      focusedByPointer.current = false
      inputRef.current?.select()
      return
    }
    caretToEnd()
  }

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="decimal"
      required={required}
      autoFocus={autoFocus}
      value={formatted}
      onChange={handleChange}
      onFocus={handleFocus}
      onClick={onClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      data-osk={noTouchKeyboard ? 'off' : undefined}
      onBlur={() => {
        focusedByPointer.current = false
      }}
      placeholder={placeholder ?? '0'}
      className={className}
    />
  )
}
