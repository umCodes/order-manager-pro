import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Makes the phone's back button / back gesture work inside the app. The app
 * has no URLs: its screens are layers (an invoice, a customer, Settings, an
 * open window) stacked over the tabs. Each open layer gets one browser
 * history entry, so "back" pops the top layer instead of leaving the app.
 *
 * App reports its layers, top last, on every render (useHistoryLayers); the
 * history is kept in step with them: a layer opened pushes an entry, a layer
 * closed by the app's own buttons goes back over its entry (that popstate is
 * skipped). A popstate the app didn't cause is the user going back: the top
 * layer's onBack runs — which may refuse (e.g. "Unsaved changes?"), and then
 * the entry is simply pushed again.
 */

export type HistoryLayer = { key: string; onBack: () => void };

let depth = 0;
let skip = 0;
let currentLayers: () => HistoryLayer[] = () => [];
let installed = false;

function sync() {
  const wanted = currentLayers().length;
  if (wanted > depth) {
    while (depth < wanted) {
      depth += 1;
      history.pushState({ appLayer: depth }, "");
    }
  } else if (wanted < depth) {
    const steps = depth - wanted;
    depth = wanted;
    skip += 1;
    history.go(-steps);
  }
}

function install() {
  if (installed) return;
  installed = true;
  window.addEventListener("popstate", () => {
    if (skip > 0) {
      skip -= 1;
      return;
    }
    depth = Math.max(0, depth - 1);
    const layers = currentLayers();
    layers[layers.length - 1]?.onBack();
    // The layer may not have closed (a prompt opened instead): put its entry back.
    window.setTimeout(sync, 60);
  });
}

/** App calls this every render with its open layers, bottom first. */
export function useHistoryLayers(layers: HistoryLayer[]) {
  const ref = useRef(layers);
  useLayoutEffect(() => {
    ref.current = layers;
  });
  useEffect(() => {
    install();
    currentLayers = () => ref.current;
  }, []);
  const signature = layers.map((l) => l.key).join("|");
  useEffect(() => {
    sync();
  }, [signature]);
}

/** Goes back exactly as the phone's back button would (used by the edge swipe). */
export function requestBack() {
  if (depth > 0) history.back();
}

/**
 * Pages that need a say before they're left by "back" (e.g. unsaved edits)
 * register their own back handler under their layer's key.
 */
const backHandlers = new Map<string, () => void>();

export function useBackHandler(key: string, handler: () => void) {
  const ref = useRef(handler);
  useLayoutEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const run = () => ref.current();
    backHandlers.set(key, run);
    return () => {
      if (backHandlers.get(key) === run) backHandlers.delete(key);
    };
  }, [key]);
}

export function backHandlerFor(key: string) {
  return backHandlers.get(key);
}
