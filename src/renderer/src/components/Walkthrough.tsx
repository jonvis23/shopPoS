import { useCallback, useEffect, useState } from 'react'
import type { ViewKey } from './TopNav'

// Written for shop staff who have never used a till app. One idea per card, and
// each card names the exact button or area it is talking about.
interface Step {
  view?: ViewKey
  // Matches a `data-tour` attribute on the real element. Left out for steps that
  // are about the whole app.
  target?: string
  title: string
  body: string
}

// Processing stock, step by step. Shared by the What's new tour and the full ? guide, so
// the two never tell staff different things.
const PROCESSING_STEPS: Step[] = [
  {
    view: 'inventory',
    target: 'process-stock',
    title: 'Process stock',
    body: 'Press Process stock to clean cereal for display or send it to posho. It has two tabs: Clean & sort (Display) and Posho. A shift must be open.',
  },
  {
    view: 'inventory',
    target: 'process-stock',
    title: 'Cleaning, step 1: take it out',
    body: 'In Clean & sort, pick the cereal, type the kilos you are taking to clean, and press Take for cleaning. Those kilos leave the stock straight away.',
  },
  {
    view: 'inventory',
    target: 'process-stock',
    title: 'Cleaning, step 2: weigh it back',
    body: 'When the cleaning is done, find the batch under Being cleaned and press Finish cleaning. Type the kilos you weighed. They go into the Display product, for example Maize Display, ready to sell.',
  },
  {
    view: 'inventory',
    target: 'process-stock',
    title: 'Posho',
    body: "In the Posho tab, pick the cereal, type the kilos and press Send to posho. When it comes back, press It's back, choose what it became, for example Maize Flour, and type the kilos.",
  },
  {
    view: 'inventory',
    target: 'process-stock',
    title: 'Fixing a mistake',
    body: 'Cancel a batch that is not finished, and its kilos go back. Edit or Void a finished batch under Recent, in the shift it was finished. A reason is always needed. A batch that has already been sold from cannot be undone.',
  },
  {
    view: 'inventory',
    target: 'new-product',
    title: 'Setting up products (admin)',
    body: 'In the settings of a product, tick Posho on cereal that can go to posho, and Processed into on what comes back, such as flour. Create the Display product, with its prices, before the first cleaning is finished.',
  },
  {
    view: 'inventory',
    target: 'stock-attention',
    title: 'The owner checks it',
    body: 'Finished batches appear under Needs attention for the owner to press Mark as checked. Batches still being cleaned or out at posho are listed there too.',
  },
]

// Shown once to everyone after an update. Change the version to show a new one.
export const WHATS_NEW_VERSION = 'processing-2026-10'

export const WHATS_NEW_STEPS: Step[] = [
  {
    title: "What's new",
    body: 'You can now clean cereal for display, send cereal to posho, and edit a sale. The app keeps track of every kilo. This short guide shows you the new buttons.',
  },
  ...PROCESSING_STEPS,
  {
    view: 'transactions',
    target: 'nav-transactions',
    title: 'Editing a sale',
    body: 'In Transactions, press Edit on a sale from this shift to change what was sold. The old sale is kept as voided. A credit sale shows how much is still owed, or Paid once it is cleared.',
  },
  {
    target: 'help',
    title: 'Need it again?',
    body: 'Press the ? button at the top right any time. The full guide has these steps too.',
  },
]

export const STEPS: Step[] = [
  {
    title: 'Welcome to Duka POS',
    body: 'This short tour shows you where everything is. Use Next to move on, or Skip at any time. You can see the tour again any time by pressing the ? button at the top right.',
  },
  {
    view: 'current',
    target: 'product-grid',
    title: 'Selling',
    body: 'Pick a cereal from the grid. Type the weight in kg, or type the shillings and the kg fills in by itself. Buying 5 kg or more automatically gets the wholesale price.',
  },
  {
    view: 'current',
    target: 'checkout',
    title: 'Taking payment',
    body: 'When the customer is ready, press Checkout. Type the cash and M-Pesa they paid. Anything they have not paid is recorded as debt, so you must choose the customer by name for a credit sale.',
  },
  {
    view: 'current',
    target: 'end-shift',
    title: 'Starting and ending the day',
    body: 'Each day starts with Open Shift: count the cash and M-Pesa in the till. At the end of the day press End Shift here. Count the till, enter what you find and print the Z-report.',
  },
  {
    view: 'current',
    target: 'expense',
    title: 'Money paid out',
    body: 'When money leaves the till for transport, fuel or rent, press Expense and write what it was for. It is then listed under Transactions.',
  },
  {
    view: 'transactions',
    target: 'nav-transactions',
    title: 'Transactions',
    body: 'Every sale and expense is listed here. Search by customer, phone or receipt number, reprint a receipt, edit a sale from this shift, or void a sale that was entered by mistake. A reason is always needed for a void.',
  },
  {
    view: 'inventory',
    target: 'nav-inventory',
    title: 'Stock',
    body: 'This shows how many bags of each cereal are left and at what price. When new stock arrives, add it here. Use it to record cereal you take home for yourself and to change a product or its price. An amber dot means less than one bag is left.',
  },
  ...PROCESSING_STEPS,
  {
    view: 'customers',
    target: 'nav-customers',
    title: 'Customers',
    body: 'This shows what each customer still owes. When a customer pays back part or all of their debt, record the repayment here.',
  },
  {
    view: 'analytics',
    target: 'nav-analytics',
    title: 'Reports',
    body: 'Sales, profit, best sellers and the busiest hours. Choose Today, This Week or a date range at the top of the page.',
  },
  {
    view: 'settings',
    target: 'settings-tabs',
    title: 'Settings',
    body: 'Shop: shop name and the rules staff work under. Staff: add people, choose what each one can do, and change PINs. Printer & screen: choose the receipt printer. Receipts: what is printed on the receipt. Backup: save a copy of your shop data. Do this regularly, because it is your protection if the computer is lost or broken. Reports has sales and profit, plus past shift reports.',
  },
  {
    target: 'help',
    title: 'You are ready',
    body: 'That is the whole tour. If you forget something, press the ? button at the top right and it will start again from the beginning.',
  },
]

interface WalkthroughProps {
  steps?: Step[]
  label?: string
  onClose: () => void
  onChangeView: (view: ViewKey) => void
}

// Returns the target's position on screen, or null if there is no such element or
// it has no size (hidden by CSS). A target that has scrolled out of view is brought
// back first, so the spotlight always lands on the real button.
function measureTarget(name?: string): DOMRect | null {
  if (!name) return null
  const element = document.querySelector<HTMLElement>(`[data-tour="${name}"]`)
  if (!element) return null
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 ? rect : null
}

export function Walkthrough({ steps = STEPS, label = 'How to use Duka POS', onClose, onChangeView }: WalkthroughProps) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = steps[index]
  const isLast = index === steps.length - 1

  const refresh = useCallback(() => {
    setRect(measureTarget(steps[index].target))
  }, [index, steps])

  // Moving to a step jumps to the screen it describes. That screen mounts on the
  // next render, so the target is measured after a short wait.
  useEffect(() => {
    if (step.view) onChangeView(step.view)
    const timer = window.setTimeout(refresh, 80)
    window.addEventListener('resize', refresh)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', refresh)
    }
  }, [index, step.view, onChangeView, refresh])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {rect ? (
        // The box-shadow dims everything outside the target, so the eye goes to it.
        // pointer-events-none keeps the real button clickable through the spotlight.
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-emerald-400 transition-all duration-200"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-900/55" />
      )}

      {/* Docked at the bottom rather than placed beside the target. Placing it next to
          the target depended on measured positions, and those went wrong whenever the
          page was scrolled, which put the card over the top bar. */}
      <div
        className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {/* Keyed on the step so each card slides in fresh, which shows the step has changed. */}
        <div
          key={index}
          className="tour-card-in max-h-[60vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
        >
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Step {index + 1} of {steps.length}
          </div>
          <h2 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{step.title}</h2>
          <p className="mb-5 text-base leading-relaxed text-slate-600 dark:text-slate-300">{step.body}</p>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Skip tour
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => (isLast ? onClose() : setIndex((i) => i + 1))}
                className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {isLast ? 'Finish' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
