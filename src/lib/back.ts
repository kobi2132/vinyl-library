import { useEffect, useRef } from 'react'

/*
 * The phone's Back button for an app with no pages.
 *
 * Every open layer (a sheet, the menu, the library's own "press again to exit" guard)
 * adds one browser-history entry. Back pops that entry, and the top layer decides what
 * happens: close itself, or step back inside itself and stay open (return true).
 * Closing a layer from the screen (X, Escape, Cancel) removes its entry too, so Back
 * never has to be pressed twice for nothing.
 */

type Handler = () => boolean | void

let exiting = false

/** Leave the app (or the page) for real: used by the library's second Back press. */
export function exitApp() {
  exiting = true
  history.back()
}

interface Layer {
  id: number
  /** Runs the layer's Back action; true means it is still open. */
  handle: () => boolean
}

const stack: Layer[] = []
let nextId = 1
let ignorePops = 0

// history.go() finishes later; entries pushed meanwhile would be wiped by it, so they wait for it to land
const waiting: number[] = []

function push(layer: Layer) {
  stack.push(layer)
  if (ignorePops > 0) waiting.push(layer.id)
  else history.pushState({ vlLayer: layer.id }, '')
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) {
      ignorePops--
      if (ignorePops === 0) for (const id of waiting.splice(0)) if (stack.some((l) => l.id === id)) history.pushState({ vlLayer: id }, '')
      return
    }
    const top = stack.pop()
    if (!top) {
      // a leftover entry from before a reload: nothing is open on it, keep going back
      if (exiting || (history.state as { vlLayer?: number } | null)?.vlLayer) history.back()
      return
    }
    // the layer handled Back internally (went one step back) and is still open
    if (top.handle()) push(top)
  })
}

function release(id: number) {
  const i = stack.findIndex((l) => l.id === id)
  if (i < 0) return
  // a layer still waiting for its entry has none to take away
  const n = stack.slice(i).filter((l) => !waiting.includes(l.id)).length
  stack.splice(i)
  if (n === 0) return
  ignorePops++
  history.go(-n)
}

/**
 * While `active`, Back calls `onBack`. Return true from `onBack` to stay open
 * (for example after going back one step inside a multi-step sheet).
 */
export function useBack(active: boolean, onBack: Handler) {
  const handler = useRef(onBack)
  useEffect(() => {
    handler.current = onBack
  })
  useEffect(() => {
    if (!active) return
    const id = nextId++
    let popped = false
    push({
      id,
      handle: () => {
        const stay = handler.current() === true
        if (!stay) popped = true
        return stay
      },
    })
    return () => {
      // closed from the screen, not by Back: take its history entry away too
      if (!popped) release(id)
    }
  }, [active])
}
