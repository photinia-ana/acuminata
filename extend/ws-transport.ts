// WsTransport — owns the WebSocket client lifecycle and pending-message queue.
// The caller connects events to a message callback; no global state leaks out.

const RECONNECT_INTERVAL = 3000

type MessageCallback = (msg: unknown) => void

class WsTransport {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pendingMessages: unknown[] = []
  private onMessageCbs: Set<MessageCallback> = new Set()
  private url: string = ""

  connect(url: string) {
    if (this.ws) return
    this.url = url
    try {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        console.log("[WsTransport] connected")
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer)
          this.reconnectTimer = null
        }
        this.flushPending()
      }

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)
          for (const cb of this.onMessageCbs) cb(msg)
        } catch (e) {
          console.error("[WsTransport] Invalid message:", e)
        }
      }

      this.ws.onclose = () => {
        console.log("[WsTransport] disconnected, reconnecting...")
        this.scheduleReconnect()
      }

      this.ws.onerror = (err) => {
        console.error("[WsTransport] error:", err)
      }
    } catch (e) {
      console.error("[WsTransport] Failed to connect:", e)
      this.scheduleReconnect()
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.pendingMessages = []
  }

  send(msg: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    } else {
      this.pendingMessages.push(msg)
    }
  }

  onMessage(cb: MessageCallback) {
    this.onMessageCbs.add(cb)
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => this.connect(this.url), RECONNECT_INTERVAL)
  }

  private flushPending() {
    while (this.pendingMessages.length > 0) {
      const msg = this.pendingMessages.shift()!
      this.send(msg)
    }
  }
}

export { WsTransport }
