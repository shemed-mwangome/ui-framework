"use strict";

/**
 * Minimal Chrome DevTools Protocol client.
 *
 * Deliberately dependency-free: Node 18+ ships a global `WebSocket`, which is
 * all a CDP client actually needs. Keeping `node_modules` out of this repo
 * means `git clone && npm test` works on a locked-down build box with nothing
 * to provision -- the same constraint that made the framework itself
 * dependency-free.
 */

const { spawn } = require("node:child_process");
const { existsSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);

function findChrome() {
  const found = CHROME_CANDIDATES.find(function (path) {
    return existsSync(path);
  });
  if (!found) {
    throw new Error(
      "No Chrome/Chromium binary found. Set CHROME_PATH to your browser executable.\n" +
        "Looked in:\n  " + CHROME_CANDIDATES.join("\n  ")
    );
  }
  return found;
}

class Connection {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;

    ws.onmessage = (event) => this._receive(JSON.parse(event.data));
    ws.onclose = () => {
      this.closed = true;
      for (const { reject } of this.pending.values()) {
        reject(new Error("CDP connection closed"));
      }
      this.pending.clear();
    };
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error("Could not connect to " + url));
    });
    return new Connection(ws);
  }

  _receive(message) {
    if (message.id !== undefined && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message + " (" + message.error.code + ")"));
      } else {
        resolve(message.result);
      }
      return;
    }
    if (!message.method) return;
    const key = (message.sessionId || "") + ":" + message.method;
    const handlers = this.listeners.get(key);
    if (handlers) handlers.forEach((fn) => fn(message.params || {}));
  }

  send(method, params, sessionId) {
    if (this.closed) return Promise.reject(new Error("CDP connection closed"));
    const id = ++this.nextId;
    const message = { id, method, params: params || {} };
    if (sessionId) message.sessionId = sessionId;
    this.ws.send(JSON.stringify(message));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  on(method, handler, sessionId) {
    const key = (sessionId || "") + ":" + method;
    if (!this.listeners.has(key)) this.listeners.set(key, []);
    this.listeners.get(key).push(handler);
    return () => {
      const handlers = this.listeners.get(key) || [];
      const index = handlers.indexOf(handler);
      if (index !== -1) handlers.splice(index, 1);
    };
  }

  /** Resolves the next time `method` fires, or rejects after `timeout` ms. */
  once(method, sessionId, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error("Timed out waiting for " + method));
      }, timeout || 10000);
      const off = this.on(
        method,
        (params) => {
          clearTimeout(timer);
          off();
          resolve(params);
        },
        sessionId
      );
    });
  }

  close() {
    this.closed = true;
    try {
      this.ws.close();
    } catch (error) {
      /* already gone */
    }
  }
}

function readWebSocketEndpoint(proc) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      reject(new Error("Chrome did not report a DevTools endpoint within 20s.\n" + buffer));
    }, 20000);

    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", function onData(chunk) {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (!match) return;
      clearTimeout(timer);
      proc.stderr.removeListener("data", onData);
      // Keep draining stderr so Chrome never blocks on a full pipe.
      proc.stderr.resume();
      resolve(match[1]);
    });

    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("Chrome exited with code " + code + " before starting.\n" + buffer));
    });
  });
}

async function launchChrome(options) {
  options = options || {};
  const binary = findChrome();
  const userDataDir = mkdtempSync(join(tmpdir(), "ui-framework-chrome-"));

  const args = [
    options.headless === false ? "" : "--headless=new",
    "--remote-debugging-port=0",
    "--user-data-dir=" + userDataDir,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-default-apps",
    "--hide-scrollbars",
    "--mute-audio",
    "--window-size=1280,900",
    "about:blank",
  ].filter(Boolean);

  const proc = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
  const endpoint = await readWebSocketEndpoint(proc);
  const connection = await Connection.connect(endpoint);

  return {
    connection,
    binary,
    async close() {
      connection.close();
      proc.kill("SIGKILL");
      await new Promise((resolve) => proc.on("exit", resolve));
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch (error) {
        /* best effort */
      }
    },
  };
}

module.exports = { launchChrome, Connection, findChrome };
