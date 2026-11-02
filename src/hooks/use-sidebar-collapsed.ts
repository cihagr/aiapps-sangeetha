import { useSyncExternalStore } from "react"

const STORAGE_KEY = "sidebar:collapsed"
const listeners = new Set<() => void>()

let collapsed = (() => {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
})()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return collapsed
}

function getServerSnapshot() {
  return false
}

export function setSidebarCollapsed(value: boolean) {
  collapsed = value
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0")
  } catch {
    /* noop */
  }
  listeners.forEach((l) => l())
}

export function toggleSidebarCollapsed() {
  setSidebarCollapsed(!collapsed)
}

export function useSidebarCollapsed() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}