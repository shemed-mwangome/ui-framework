"use strict";

/**
 * Static file server for the repo root, plus an in-memory fixture registry.
 *
 * Tests are served over real HTTP rather than `file://` so the framework loads
 * exactly the way it does in production: separate `<link>`/`<script>` requests,
 * normal same-origin rules, and a real `DOMContentLoaded` that exercises the
 * auto-init path in `00-core.js`.
 */

const http = require("node:http");
const { readFile } = require("node:fs/promises");
const { join, normalize, extname } = require("node:path");

const REPO_ROOT = join(__dirname, "..", "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

async function start(options) {
  options = options || {};
  const fixtures = new Map();
  const assets = options.assets || "dist";

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");

    if (url.pathname.startsWith("/__fixture__/")) {
      const id = url.pathname.slice("/__fixture__/".length);
      const html = fixtures.get(id);
      if (html === undefined) {
        response.writeHead(404).end("Unknown fixture: " + id);
        return;
      }
      response.writeHead(200, {
        "Content-Type": MIME[".html"],
        "Cache-Control": "no-store",
      });
      response.end(html);
      return;
    }

    // Serve repo files, refusing to escape the repo root.
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    const absolute = join(REPO_ROOT, relative);
    if (!absolute.startsWith(REPO_ROOT)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    try {
      const body = await readFile(absolute);
      response.writeHead(200, {
        "Content-Type": MIME[extname(absolute)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(body);
    } catch (error) {
      response.writeHead(404).end("Not found: " + relative);
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  let counter = 0;

  return {
    origin: "http://127.0.0.1:" + port,

    /**
     * Registers a full HTML document built around `bodyHtml` and returns its
     * URL. `assets` selects which build the fixture loads, so the same specs
     * can be pointed at `dist/` (the bundle users consume) or `src/` (the
     * modular files) -- catching build-order drift between the two.
     */
    fixture(bodyHtml, fixtureOptions) {
      fixtureOptions = fixtureOptions || {};
      const id = "f" + ++counter;
      const styles = (fixtureOptions.styles || []).map(
        (href) => '<link rel="stylesheet" href="' + href + '">'
      );
      const scripts = (fixtureOptions.scripts || []).map(
        (src) => '<script src="' + src + '"></script>'
      );

      const head = fixtureOptions.bare
        ? []
        : ['<link rel="stylesheet" href="/' + assets + '/ui-framework.css">'];
      const tail = fixtureOptions.bare
        ? []
        : ['<script src="/' + assets + '/ui-framework.js"></script>'];

      const html =
        "<!doctype html>\n" +
        '<html lang="en"' +
        (fixtureOptions.theme ? ' data-ui-theme="' + fixtureOptions.theme + '"' : "") +
        ">\n" +
        "<head>\n" +
        '<meta charset="utf-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
        "<title>ui-framework fixture</title>\n" +
        head.concat(styles).join("\n") +
        "\n</head>\n" +
        '<body class="ui-scope">\n' +
        bodyHtml +
        "\n" +
        tail.concat(scripts).join("\n") +
        "\n</body>\n</html>";

      fixtures.set(id, html);
      return this.origin + "/__fixture__/" + id;
    },

    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = { start, REPO_ROOT };
