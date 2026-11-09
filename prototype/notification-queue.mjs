/** Serialize spoken task notifications while giving user speech priority. */
export class NotificationQueue {
  #pending = [];
  #current;
  #available = false;
  #closed = false;
  #speak;
  #onError;

  constructor({ speak, onError = () => {} }) {
    this.#speak = speak;
    this.#onError = onError;
  }

  enqueue(notification) {
    if (this.#closed) return;
    this.#pending.push(notification);
    this.#drain();
  }

  setAvailable(available) {
    if (this.#closed) return;
    this.#available = available;
    if (!available && this.#current) this.#current.controller.abort();
    else this.#drain();
  }

  close() {
    this.#closed = true;
    this.#pending = [];
    this.#current?.controller.abort();
  }

  async #drain() {
    if (this.#closed || !this.#available || this.#current || !this.#pending.length) return;
    const current = { notification: this.#pending.shift(), controller: new AbortController() };
    this.#current = current;
    try {
      await this.#speak(current.notification, current.controller.signal);
      // An implementation may finish just as it receives cancellation.
      if (current.controller.signal.aborted && !this.#closed) this.#pending.unshift(current.notification);
    } catch (error) {
      if (current.controller.signal.aborted && !this.#closed) this.#pending.unshift(current.notification);
      else if (!this.#closed) this.#onError(error, current.notification);
    } finally {
      this.#current = undefined;
      this.#drain();
    }
  }
}
