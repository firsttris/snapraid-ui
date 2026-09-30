import { Check, ChevronDown } from 'lucide-react'
import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption<T extends string | number> {
  value: T
  label: string
  // Secondary text, e.g. the path of a config
  hint?: string
}

interface SelectProps<T extends string | number> {
  id?: string
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
}

const LIST_MAX_HEIGHT = 288
const LIST_GAP = 4

/**
 * Replacement for the native <select>, whose opened option list the browser
 * draws itself and cannot be styled. Follows the select-only combobox pattern:
 * focus stays on the trigger, the highlighted option is announced through
 * aria-activedescendant. The list is portaled so dialogs with overflow do not
 * clip it.
 */
export const Select = <T extends string | number>({
  id,
  value,
  options,
  onChange,
  disabled = false,
  size = 'md',
  className = '',
}: SelectProps<T>) => {
  const listId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [position, setPosition] = useState<CSSProperties>()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typeahead = useRef({ text: '', timer: 0 })

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = options[selectedIndex]
  const optionId = (index: number) => `${listId}-${index}`

  const open = () => {
    if (disabled || options.length === 0) return
    setActiveIndex(Math.max(selectedIndex, 0))
    setIsOpen(true)
  }

  const close = () => setIsOpen(false)

  const choose = (index: number) => {
    const option = options[index]
    if (option && option.value !== value) onChange(option.value)
    close()
    triggerRef.current?.focus()
  }

  // Place the list below the trigger, or above when there is more room there
  useLayoutEffect(() => {
    if (!isOpen) return
    const place = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const listHeight = Math.min(
        listRef.current?.scrollHeight ?? LIST_MAX_HEIGHT,
        LIST_MAX_HEIGHT,
      )
      const below = window.innerHeight - rect.bottom - LIST_GAP
      const above = rect.top - LIST_GAP
      const flip = below < listHeight && above > below
      setPosition({
        left: rect.left,
        minWidth: rect.width,
        maxWidth: Math.max(rect.width, window.innerWidth - rect.left - 8),
        maxHeight: Math.min(LIST_MAX_HEIGHT, (flip ? above : below) - 8),
        ...(flip
          ? { bottom: window.innerHeight - rect.top + LIST_GAP }
          : { top: rect.bottom + LIST_GAP }),
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !triggerRef.current?.contains(target) &&
        !listRef.current?.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  useEffect(() => {
    if (disabled) setIsOpen(false)
  }, [disabled])

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return
    document
      .getElementById(optionId(activeIndex))
      ?.scrollIntoView({ block: 'nearest' })
  })

  // Jump to the next option starting with the typed characters, like a native select
  const handleTypeahead = (key: string) => {
    const state = typeahead.current
    window.clearTimeout(state.timer)
    state.text += key.toLowerCase()
    state.timer = window.setTimeout(() => {
      state.text = ''
    }, 500)
    const start = isOpen ? activeIndex : selectedIndex
    const order = options.map((_, i) => (start + 1 + i) % options.length)
    // A repeated single letter cycles through the matches
    const prefix = state.text.split('').every((c) => c === state.text[0])
      ? state.text[0]
      : state.text
    const match = order.find((i) =>
      options[i].label.toLowerCase().startsWith(prefix),
    )
    if (match === undefined) return
    if (isOpen) setActiveIndex(match)
    else onChange(options[match].value)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1
    if (!isOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        open()
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        handleTypeahead(event.key)
      }
      return
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, last))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
        break
      case 'Home':
      case 'PageUp':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
      case 'PageDown':
        event.preventDefault()
        setActiveIndex(last)
        break
      case 'Enter':
        event.preventDefault()
        choose(activeIndex)
        break
      case ' ':
        event.preventDefault()
        if (typeahead.current.text) handleTypeahead(' ')
        else choose(activeIndex)
        break
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        setIsOpen(false)
        break
      case 'Tab':
        setIsOpen(false)
        break
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          handleTypeahead(event.key)
        }
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={
          isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined
        }
        disabled={disabled}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleKeyDown}
        className={`flex w-full items-center gap-2 rounded-lg border bg-white text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50 ${
          isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/30'
            : 'border-gray-300 hover:border-gray-400 focus-visible:border-blue-500'
        } ${size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-3 py-2'} ${className}`}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected ? (
            <>
              {selected.label}
              {selected.hint && (
                <span className="ml-2 text-gray-500">{selected.hint}</span>
              )}
            </>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className={`shrink-0 text-gray-500 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={id}
            tabIndex={-1}
            style={{
              ...position,
              visibility: position ? 'visible' : 'hidden',
            }}
            className="fixed z-[80] overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
          >
            {options.map((option, index) => {
              const isSelected = index === selectedIndex
              const isActive = index === activeIndex
              return (
                // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard is handled on the trigger, which keeps focus
                <div
                  key={String(option.value)}
                  id={optionId(index)}
                  role="option"
                  tabIndex={-1}
                  aria-selected={isSelected}
                  onPointerMove={() => setActiveIndex(index)}
                  // Keep focus on the trigger
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                  className={`flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 pl-2 ${
                    size === 'sm' ? 'text-sm' : ''
                  } ${isActive ? 'bg-blue-50' : ''} ${
                    isSelected ? 'font-medium text-blue-700' : 'text-gray-800'
                  }`}
                >
                  <Check
                    size={15}
                    aria-hidden
                    className={`shrink-0 ${isSelected ? 'text-blue-600' : 'invisible'}`}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                    {option.hint && (
                      <span className="ml-2 font-normal text-gray-500">
                        {option.hint}
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
