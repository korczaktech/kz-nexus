/**
 * Minimal typed event emitter used by the editor session. Listener errors
 * are caught and reported through `onListenerError` instead of propagating,
 * so a broken subscriber never corrupts engine state or blocks other
 * listeners (Section 6.3).
 */
export type Listener<T> = (payload: T) => void;

export class TypedEmitter<EventMap extends Record<string, unknown>> {
  private listeners = new Map<keyof EventMap, Set<Listener<unknown>>>();
  onListenerError: (error: unknown, event: keyof EventMap) => void = () => {};

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
    return () => this.off(event, listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<unknown>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener(payload);
      } catch (error) {
        this.onListenerError(error, event);
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
