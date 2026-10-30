// Ported from slawrensen/hwinfo-streamdeck test/docs-crawl.test.mjs at 022cb3f,
// without the legacy-archive and preview-edition cases the Mac docs do not have.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createRawServer } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const crawler = fileURLToPath(new URL("../../scripts/docs-crawl.mjs", import.meta.url));
const contractFile = fileURLToPath(new URL("../../scripts/docs-route-contract.json", import.meta.url));

async function fixture(t, pages) {
	const requests = new Map();
	const server = createServer((req, res) => {
		const pathname = new URL(req.url, "http://127.0.0.1").pathname;
		requests.set(pathname, (requests.get(pathname) ?? 0) + 1);
		const searchPrefix = pathname.endsWith("/assets/js/search-data.json") ? pathname.slice(0, -"assets/js/search-data.json".length) : null;
		const defaultSearch = searchPrefix === null ? null : { type: "application/json", html: JSON.stringify({ home: { title: "Home", content: "Public docs", url: searchPrefix } }) };
		const page = pages[pathname] ?? defaultSearch ?? { status: 404, html: "Not found" };
		res.writeHead(page.status ?? 200, { "content-type": page.type ?? "text/html; charset=utf-8" });
		res.end(page.html);
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	t.after(async () => {
		await new Promise((resolve, reject) => {
			server.close((err) => err ? reject(err) : resolve());
			server.closeAllConnections();
		});
	});
	return { root: `http://127.0.0.1:${server.address().port}/`, requests };
}

async function crawl(root, ...args) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [crawler, root, ...args], { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		const deadline = setTimeout(() => {
			child.kill();
			reject(new Error("local docs crawl did not exit within 10 seconds"));
		}, 10_000);
		child.stdout.on("data", (chunk) => { stdout += chunk; });
		child.stderr.on("data", (chunk) => { stderr += chunk; });
		child.once("error", (err) => { clearTimeout(deadline); reject(err); });
		child.once("close", (code) => { clearTimeout(deadline); resolve({ code, stdout, stderr }); });
	});
}

function manifest(t, routes) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mac-docs-route-contract-"));
	t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	const file = path.join(directory, "routes.json");
	fs.writeFileSync(file, JSON.stringify({ schema: 1, routes }));
	return file;
}

describe("docs crawler inspects every reachable page and proves private 404s", () => {
	it("inspects a page first fetched for an anchor and finds its broken child", async (t) => {
		const { root, requests } = await fixture(t, {
			"/": { html: '<a href="target.html#exists">Target</a>' },
			"/target.html": { html: '<h1 id="exists">Target</h1><a href="missing.html">Broken child</a>' }
		});
		const result = await crawl(root);
		assert.equal(result.code, 1, `a prefetched page must still be inspected: ${result.stdout}`);
		assert.match(result.stderr, /missing\.html: HTTP 404/);
		assert.equal(requests.get("/target.html"), 1, "inspection reuses the fetched page");
		assert.equal(requests.get("/missing.html"), 1);
	});

	it("also checks expected text and leaks on an anchor-prefetched page", async (t) => {
		const { root } = await fixture(t, {
			"/": { html: 'Release marker <a href="target.html#exists">Target</a>' },
			"/target.html": { html: '<h1 id="exists">Target</h1>RELEASE_RUNBOOK' }
		});
		const result = await crawl(root, "--expect", "Release marker");
		assert.equal(result.code, 1);
		assert.match(result.stderr, /target\.html: missing expected text/);
		assert.match(result.stderr, /target\.html: leaks/);
	});

	it("fails a page that links the private product repository, in any letter case, and passes the public docs repository", async (t) => {
		const { root } = await fixture(t, {
			"/": { html: '<a href="https://github.com/slawrensen/slawrensen.github.io/issues">Public issues</a><a href="bugs.html">Bugs</a><a href="nav.html">Nav</a>' },
			"/bugs.html": { html: '<a href="https://github.com/slawrensen/mac-sensors-streamdeck/issues">Report a bug</a>' },
			"/nav.html": { html: '<a href="https://GitHub.com/Slawrensen/Mac-Sensors-StreamDeck/releases">Releases</a>' }
		});
		const result = await crawl(root);
		assert.equal(result.code, 1, `a private repository link must fail the crawl: ${result.stdout}`);
		assert.match(result.stderr, /bugs\.html: leaks .*mac-/);
		assert.match(result.stderr, /nav\.html: leaks .*mac-/);
		assert.doesNotMatch(result.stderr, /:\d+\/: leaks/, "the public documentation repository is not a leak");
	});

	it("fails a page that names the sibling product", async (t) => {
		const { root } = await fixture(t, { "/": { html: "<p>Built from the HWiNFO Sensors docs</p>" } });
		const result = await crawl(root);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /leaks \/HWiNFO\|REALiX\//);
	});

	for (const status of [200, 500]) {
		it(`rejects a private path returning HTTP ${status}`, async (t) => {
			const { root } = await fixture(t, {
				"/": { html: "Public page" },
				"/README.html": { status, html: "Private response" }
			});
			const result = await crawl(root);
			assert.equal(result.code, 1, `HTTP ${status} does not establish a private 404`);
			assert.match(result.stderr, new RegExp(`private path.*README\\.html.*HTTP ${status}.*expected 404`));
		});
	}

	it("rejects a release runbook source file published beside the pages", async (t) => {
		const { root } = await fixture(t, {
			"/": { html: "Public page" },
			"/release/OWNER-MEDIA.md": { type: "text/plain", html: "Owner media plan" }
		});
		const result = await crawl(root);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /private path \/release\/OWNER-MEDIA\.md: HTTP 200, expected 404/);
	});

	it("passes healthy anchored pages, handles cycles and fetches each URL once", async (t) => {
		const { root, requests } = await fixture(t, {
			"/": { html: 'Release marker <a href="target.html#exists">Target</a><a href="target.html">Again</a>' },
			"/target.html": { html: '<h1 id="exists">Release marker</h1><a href="/">Back</a><a href="#exists">Self</a>' }
		});
		const result = await crawl(root, "--expect", "Release marker");
		assert.equal(result.code, 0, result.stderr);
		assert.match(result.stdout, /DOCS CRAWL: no broken links/);
		assert.equal(requests.get("/"), 1);
		assert.equal(requests.get("/target.html"), 1);
	});
});

describe("docs crawler catches redesigned-site and deployment regressions", () => {
	it("checks an unlinked route and a removed fragment from the route contract", async t => {
		const { root, requests } = await fixture(t, {
			"/docs/": { html: "New navigation" },
			"/docs/old-guide.html": { html: '<h1 id="new-heading">Old guide</h1>' }
		});
		const contract = manifest(t, [
			{ path: "", anchors: [] },
			{ path: "old-guide.html", anchors: ["original-heading"] },
			{ path: "lost-page.html", anchors: [] }
		]);
		const result = await crawl(`${root}docs/`, "--manifest", contract);
		assert.equal(result.code, 1, result.stdout);
		assert.match(result.stderr, /old-guide\.html: required route-contract anchor #original-heading/);
		assert.match(result.stderr, /lost-page\.html: HTTP 404/);
		assert.equal(requests.get("/docs/old-guide.html"), 1);
	});

	it("keeps every published route and heading fragment in the committed contract", () => {
		const contract = JSON.parse(fs.readFileSync(contractFile, "utf8"));
		assert.equal(contract.schema, 1);
		assert.match(contract.source_commit, /^[a-f0-9]{40}$/);
		const paths = contract.routes.map(route => route.path).sort();
		assert.deepEqual(paths, ["", "changelog.html", "data-sources.html", "dial-controls.html", "faq.html", "getting-started.html", "hardware.html", "installation.html", "sensor-details.html", "sensor-dial.html", "sensor-reading.html", "status-screens.html", "themes.html", "thresholds.html", "troubleshooting.html"]);
		for (const route of contract.routes) assert.equal(new Set(route.anchors).size, route.anchors.length, `${route.path} lists each fragment once`);
		assert.ok(contract.routes.reduce((sum, route) => sum + route.anchors.length, 0) >= 221);
	});

	it("verifies a consistent production build and canonical-host search links under a local subpath", async t => {
		const sourceSha = "a".repeat(40);
		const buildId = `docs-${sourceSha.slice(0, 12)}`;
		const html = content => `<meta name="docs-build-id" content="${buildId}"><meta name="docs-source-sha" content="${sourceSha}">${content}`;
		const { root, requests } = await fixture(t, {
			"/docs/": { html: html('<link rel="canonical" href="https://docs.example.test/docs/"><a href="guide.html#ready">Guide</a>') },
			"/docs/guide.html": { html: html('<h1 id="ready">Guide</h1>') },
			"/docs/docs-build.json": { type: "application/json", html: JSON.stringify({ kind: "documentation-production", build_id: buildId, source_commit: sourceSha }) },
			"/docs/assets/js/search-data.json": { type: "application/json", html: JSON.stringify({ guide: { title: "Guide", content: "Searchable content", url: "https://docs.example.test/docs/guide.html#ready" } }) }
		});
		const result = await crawl(`${root}docs/`, "--build-id", buildId, "--source-sha", sourceSha);
		assert.equal(result.code, 0, result.stderr);
		assert.match(result.stdout, /build docs-aaaaaaaaaaaa checked/);
		assert.equal(requests.get("/docs/docs-build.json"), 1);
	});

	it("rejects a cached page from a different build and a mismatched expected build", async t => {
		const sourceSha = "a".repeat(40);
		const { root } = await fixture(t, {
			"/docs/": { html: `<meta name="docs-build-id" content="docs-bbbbbbbbbbbb"><meta name="docs-source-sha" content="${"b".repeat(40)}">` },
			"/docs/docs-build.json": { type: "application/json", html: JSON.stringify({ kind: "documentation-production", build_id: `docs-${sourceSha.slice(0, 12)}`, source_commit: sourceSha }) }
		});
		const result = await crawl(`${root}docs/`, "--build-id", "docs-cccccccccccc");
		assert.equal(result.code, 1);
		assert.match(result.stderr, /expected build docs-cccccccccccc, got docs-aaaaaaaaaaaa/);
		assert.match(result.stderr, /build meta does not match/);
		assert.match(result.stderr, /source meta does not match/);
	});

	it("rejects a production page left noindex", async t => {
		const { root } = await fixture(t, { "/": { html: '<meta name="robots" content="noindex">Public page' } });
		const result = await crawl(root);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /must be indexable/);
	});

	it("checks every picture and img srcset candidate rather than only the fallback image", async t => {
		const { root, requests } = await fixture(t, {
			"/docs/": { html: '<picture><source srcset="assets/small.webp 400w, assets/missing.webp 800w"><img src="assets/fallback.png" srcset="assets/fallback.png 1x, assets/retina.png 2x" alt="Deck"></picture>' },
			"/docs/assets/small.webp": { type: "image/webp", html: "small" },
			"/docs/assets/fallback.png": { type: "image/png", html: "fallback" },
			"/docs/assets/retina.png": { type: "image/png", html: "retina" }
		});
		const result = await crawl(`${root}docs/`);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /asset \/docs\/assets\/missing\.webp HTTP 404/);
		assert.equal(requests.get("/docs/assets/fallback.png"), 1);
		assert.equal(requests.get("/docs/assets/retina.png"), 1);
	});

	it("checks favicon and touch icon links", async t => {
		const { root } = await fixture(t, { "/docs/": { html: '<link rel="icon" href="assets/icon.png"><link rel="apple-touch-icon" href="assets/touch.png">' } });
		const result = await crawl(`${root}docs/`);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /asset \/docs\/assets\/icon\.png HTTP 404/);
		assert.match(result.stderr, /asset \/docs\/assets\/touch\.png HTTP 404/);
	});

	it("rejects a root-relative image that escapes the project base even if that image exists", async t => {
		const { root } = await fixture(t, {
			"/docs/": { html: '<img src="/assets/deck.png" alt="Deck">' },
			"/assets/deck.png": { type: "image/png", html: "wrong base" }
		});
		const result = await crawl(`${root}docs/`);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /asset escapes site base \/assets\/deck\.png/);
	});

	it("finds private material in the JSON search index even when every HTML page is clean", async t => {
		const { root } = await fixture(t, {
			"/": { html: "Clean public page" },
			"/assets/js/search-data.json": { type: "application/json", html: JSON.stringify({ leak: { title: "Release notes", content: "COPY_RULES private text", url: "/release/private.html" } }) }
		});
		const result = await crawl(root);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /search-data\.json: leaks \/COPY_RULES\//);
		assert.match(result.stderr, /indexes private path \/release\/private\.html/);
	});

	it("rejects broken search-result fragments and results pointing at another base path", async t => {
		const { root } = await fixture(t, {
			"/docs/": { html: "Clean docs" },
			"/docs/guide.html": { html: '<h1 id="current">Guide</h1>' },
			"/docs/assets/js/search-data.json": { type: "application/json", html: JSON.stringify({ missing: { title: "Guide", url: "/docs/guide.html#removed" }, wrongSite: { title: "Wrong site", url: "/elsewhere/guide.html" } }) }
		});
		const result = await crawl(`${root}docs/`);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /search anchor \/docs\/guide\.html#removed not on that page/);
		assert.match(result.stderr, /search result escapes site base \/elsewhere\/guide\.html/);
	});

	it("requires a real, nonempty JSON search index", async t => {
		const { root } = await fixture(t, {
			"/": { html: "Clean public page" },
			"/assets/js/search-data.json": { html: "An HTML error disguised as success" }
		});
		const result = await crawl(root);
		assert.equal(result.code, 1);
		assert.match(result.stderr, /invalid JSON search index/);
	});

	it("requires a missing page to answer 404 with the site's own not-found page", async t => {
		const notFound = "<title>Page not found | Docs</title><a href=\"/\">Home</a>";
		const soft = await fixture(t, { "/": { html: "Public page" }, "/404.html": { html: notFound } });
		const softResult = await crawl(soft.root);
		assert.equal(softResult.code, 1);
		assert.match(softResult.stderr, /missing page: does not serve the site's 404\.html/);
	});
});

// A closing HTTP/1.0 peer exercises the response-stream failure seen with an
// actual Python-hosted Jekyll build, rather than just tiny HTTP/1.1 fixtures.
async function closingPeer(t, truncated = false) {
	const sockets = new Set();
	const asset = Buffer.alloc(2 * 1024 * 1024, 1);
	const server = createRawServer(socket => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
		socket.on("error", () => { /* Client failures are asserted through crawler output. */ });
		let request = "";
		const receive = data => {
			request += data.toString();
			if (!request.includes("\r\n\r\n")) return;
			socket.removeListener("data", receive);
			const route = request.split(" ")[1];
			let status = 200;
			let type = "text/html";
			let body;
			let declaredLength;
			if (route === "/") body = Buffer.from('<h1>Docs</h1><img src="large.png" alt="Deck">');
			else if (route === "/assets/js/search-data.json") {
				type = "application/json";
				body = Buffer.from(JSON.stringify({ home: { title: "Home", url: "/" } }));
			} else if (route === "/large.png") {
				type = "image/png";
				body = truncated ? asset.subarray(0, 1024) : asset;
				declaredLength = asset.length;
			} else { status = 404; body = Buffer.from("Not found"); }
			const headers = Buffer.from(`HTTP/1.0 ${status} ${status === 200 ? "OK" : "Not Found"}\r\nContent-Type: ${type}\r\nContent-Length: ${declaredLength ?? body.length}\r\nConnection: close\r\n\r\n`);
			socket.end(Buffer.concat([headers, body]));
		};
		socket.on("data", receive);
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	t.after(async () => {
		for (const socket of sockets) socket.destroy();
		await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	});
	return `http://127.0.0.1:${server.address().port}/`;
}

describe("docs crawler consumes closing response streams", () => {
	it("finishes large image bodies from an HTTP/1.0 server and exits after reporting success", async t => {
		const root = await closingPeer(t);
		const result = await crawl(root);
		assert.equal(result.code, 0, result.stderr);
		assert.match(result.stdout, /DOCS CRAWL: no broken links/);
	});

	it("reports a truncated asset transfer as a failed check instead of claiming success", async t => {
		const root = await closingPeer(t, true);
		const result = await crawl(root);
		assert.equal(result.code, 1, result.stdout);
		assert.match(result.stderr, /asset \/large\.png HTTP -1/);
		assert.doesNotMatch(result.stderr, /AssertionError|Parser\.finish/);
	});
});
