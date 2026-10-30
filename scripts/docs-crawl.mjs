// Mac port of the sibling docs crawler (slawrensen/hwinfo-streamdeck
// scripts/docs-crawl.mjs at 022cb3f), without its legacy-archive and
// preview-edition modes, which the Mac docs do not have.
//
// Crawls the actual built or published Jekyll site, including routes no longer
// reachable from navigation. Browser interaction and rendering are separate.
//
//   node scripts/docs-crawl.mjs <root> --manifest scripts/docs-route-contract.json
//   node scripts/docs-crawl.mjs https://docs.slawrensen.com/mac-streamdeck/ --build-id docs-<source> --source-sha <sha> --host-404
//
// Exit 1 on any broken link, image, srcset candidate or anchor, a missing
// route-contract page or fragment, private material in a page or the search
// index, a private path or missing page that does not answer 404, or a page
// missing the --expect text. The default Just the Docs search index is
// mandatory; --search-index can name another site-relative JSON index.
import fs from "node:fs";
import { parseArgs } from "node:util";

/** Paths the site's _config.yml excludes; each must answer a real HTTP 404. */
const PRIVATE = [
	"release/RELEASE_RUNBOOK.html", "release/COPY_RULES.html", "release/STREAM_DECK_MARKETPLACE.html", "release/OWNER-MEDIA.html",
	"release/RELEASE_RUNBOOK.md", "release/COPY_RULES.md", "release/STREAM_DECK_MARKETPLACE.md", "release/OWNER-MEDIA.md",
	"release/", "release/evidence/", "README.html"
];
/** Strings that never belong in a public page. The product repository is private, so any link into it is a 404 for public readers. */
const LEAK = [/\/Users\//, /HWiNFO|REALiX/, /C:\\Users\\/i, /RELEASE_RUNBOOK/, /COPY_RULES/, /STREAM_DECK_MARKETPLACE/, /\.private\b/, /hwinfoden|hwinfospk/, /ghp_[A-Za-z0-9]{20,}/, /github\.com[/:]slawrensen\/mac-(?:sensors-)?streamdeck/i];

function decode(value) {
	return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi, entity => {
		const named = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" };
		if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
		const code = entity[2].toLowerCase() === "x" ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
		return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
	});
}

function tags(html) {
	return [...html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)].map(match => {
		const attributes = {};
		for (const attr of match[2].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
			attributes[attr[1].toLowerCase()] = decode(attr[2] ?? attr[3] ?? attr[4] ?? "");
		}
		return { name: match[1].toLowerCase(), attributes };
	});
}

function fragment(url) {
	try { return decodeURIComponent(url.hash.slice(1)); }
	catch { return url.hash.slice(1); }
}

function ids(html) {
	return new Set(tags(html).flatMap(tag => [tag.attributes.id, tag.name === "a" ? tag.attributes.name : null].filter(Boolean)));
}

function readContract(file) {
	if (!file) return [];
	const value = JSON.parse(fs.readFileSync(file, "utf8"));
	if (value.schema !== 1 || !Array.isArray(value.routes)) throw new Error("Route manifest must have schema: 1 and a routes array");
	for (const entry of value.routes) {
		if (!entry || typeof entry.path !== "string" || !Array.isArray(entry.anchors) || entry.anchors.some(anchor => typeof anchor !== "string")) {
			throw new Error("Each manifest route needs a path string and an anchors array of strings");
		}
		if (/^[a-z][a-z\d+.-]*:|^\/\/|[?#]/i.test(entry.path) || entry.path.split("/").includes("..")) {
			throw new Error(`Manifest route must be site-relative: ${entry.path}`);
		}
	}
	return value.routes;
}

async function main() {
	const { values, positionals } = parseArgs({ allowPositionals: true, options: {
		expect: { type: "string" },
		manifest: { type: "string" },
		"build-id": { type: "string" },
		"source-sha": { type: "string" },
		"search-index": { type: "string", default: "assets/js/search-data.json" },
		// A subfolder of a GitHub Pages user site gets the host's not-found page, never its own 404.html.
		"host-404": { type: "boolean", default: false }
	} });
	const root = positionals[0];
	if (positionals.length !== 1 || typeof root !== "string" || !/^https?:\/\//.test(root)) {
		throw new Error("usage: node scripts/docs-crawl.mjs <root> [--expect text] [--manifest file] [--build-id id] [--source-sha sha] [--search-index path]");
	}
	const base = new URL(root.endsWith("/") ? root : `${root}/`);
	if (base.hash || base.search) throw new Error("Site root must not contain a query or fragment");
	if (values["source-sha"] && !/^[a-f0-9]{40}$/.test(values["source-sha"])) throw new Error("--source-sha must be a full 40-character commit SHA");
	const contract = readContract(values.manifest);
	const seen = new Map();
	const pending = new Map();
	const processed = new Set();
	const problems = [];
	const queue = [base.href];
	const siteOrigins = new Set([base.origin]);
	const expected = new Map();
	let htmlBuildId = values["build-id"] ?? null;
	let buildManifest = null;
	const isInternal = url => url.origin === base.origin && url.pathname.startsWith(base.pathname);
	const isPrivate = url => {
		const relative = decodeURIComponent(url.pathname.slice(base.pathname.length));
		return /(?:^|\/)(?:release(?:\/|$)|README\.html$)/i.test(relative);
	};
	const absolute = (value, from = base.href) => {
		const target = new URL(value, from);
		// Jekyll's absolute_url in search data uses its canonical production host
		// during local builds. Rebase only the known site's own current subpath.
		if (siteOrigins.has(target.origin) && target.pathname.startsWith(base.pathname)) {
			target.protocol = base.protocol;
			target.host = base.host;
		}
		return target;
	};
	const scanLeaks = (url, body) => {
		for (const expression of LEAK) if (expression.test(body)) problems.push(`${url}: leaks ${expression}`);
	};

	async function fetchPage(value) {
		const target = new URL(value); target.hash = "";
		const url = target.href;
		if (seen.has(url)) return seen.get(url);
		if (pending.has(url)) return pending.get(url);
		const work = (async () => {
			let entry;
			try {
				const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
				const type = response.headers.get("content-type") ?? "";
				let text = "";
				let bytes = 0;
				if (/(?:text\/html|application\/(?:json|xhtml\+xml))/.test(type) || target.pathname.endsWith(".json")) {
					text = await response.text();
					bytes = Buffer.byteLength(text);
				} else if (response.body) {
					// Drain every response. Leaving a large asset body unread can
					// strand a connection and keep the crawler alive after its report,
					// and a truncated transfer must fail rather than pass on status.
					for await (const chunk of response.body) bytes += chunk.byteLength;
				}
				entry = { status: response.status, type, html: /(?:text\/html|application\/xhtml\+xml)/.test(type) ? text : "", text, bytes, finalUrl: response.url };
				if (isInternal(target) && !isInternal(new URL(response.url))) problems.push(`${url}: redirects outside the site to ${response.url}`);
			} catch (error) {
				entry = { status: -1, html: "", type: "", text: String(error), finalUrl: url };
			}
			seen.set(url, entry);
			return entry;
		})();
		pending.set(url, work);
		return work;
	}

	function enqueue(url) {
		url.hash = "";
		if (!processed.has(url.href) && !queue.includes(url.href)) queue.push(url.href);
	}

	async function checkLink(from, value, context = "anchor") {
		if (/^(?:mailto|tel|javascript|data|blob):/i.test(value)) return;
		let target;
		try { target = absolute(value, from); }
		catch { problems.push(`${from}: unparsable href ${value}`); return; }
		if (!isInternal(target)) return;
		if (isPrivate(target)) problems.push(`${from}: links to private path ${target.pathname}`);
		const hash = fragment(target); target.hash = "";
		if (hash) {
			const linked = await fetchPage(target.href);
			if (linked.status === 200 && linked.html && !ids(linked.html).has(hash)) {
				problems.push(`${from}: ${context} ${target.pathname}#${hash} not on that page`);
			}
		}
		enqueue(target);
	}

	async function checkAsset(from, value, image = false) {
		if (!value || /^(?:data|blob):/i.test(value)) return;
		let target;
		try { target = absolute(value, from); }
		catch { problems.push(`${from}: unparsable asset ${value}`); return; }
		if (!siteOrigins.has(target.origin)) return;
		if (!isInternal(target)) {
			problems.push(`${from}: asset escapes site base ${target.pathname}`);
			return;
		}
		if (isPrivate(target)) problems.push(`${from}: loads private asset ${target.pathname}`);
		const asset = await fetchPage(target.href);
		if (asset.status !== 200) problems.push(`${from}: asset ${target.pathname} HTTP ${asset.status}`);
		else if (image && asset.html) problems.push(`${from}: image ${target.pathname} returned HTML`);
	}

	async function readIdentity(expectedBuild, expectedSource) {
		const url = new URL("docs-build.json", base).href;
		const response = await fetchPage(url);
		if (response.status !== 200) { problems.push(`${url}: HTTP ${response.status}`); return null; }
		let manifest;
		try { manifest = JSON.parse(response.text); }
		catch { problems.push(`${url}: invalid JSON build manifest`); return null; }
		if (manifest.kind !== "documentation-production" || !/^[a-f0-9]{40}$/.test(manifest.source_commit ?? "") || manifest.build_id !== `docs-${manifest.source_commit?.slice(0, 12)}`) {
			problems.push(`${url}: invalid documentation-production build identity`);
		}
		if (expectedBuild && manifest.build_id !== expectedBuild) problems.push(`${url}: expected build ${expectedBuild}, got ${manifest.build_id}`);
		if (expectedSource && manifest.source_commit !== expectedSource) problems.push(`${url}: source commit does not match expected ${expectedSource}`);
		return manifest;
	}

	async function checkSearch(index) {
		const searchUrl = absolute(index, base.href);
		if (!isInternal(searchUrl)) { problems.push(`${searchUrl.href}: search index escapes the site`); return; }
		const search = await fetchPage(searchUrl.href);
		if (search.status !== 200) { problems.push(`${searchUrl.href}: search index HTTP ${search.status}`); return; }
		try {
			const data = JSON.parse(search.text);
			const strings = [];
			const collect = value => {
				if (typeof value === "string") strings.push(value);
				else if (value && typeof value === "object") Object.values(value).forEach(collect);
			};
			collect(data);
			scanLeaks(searchUrl.href, strings.join("\n"));
			const records = data && typeof data === "object" ? Object.values(data) : [];
			if (!records.length) problems.push(`${searchUrl.href}: search index is empty`);
			for (const record of records) {
				if (!record || typeof record.url !== "string") { problems.push(`${searchUrl.href}: search record has no URL`); continue; }
				let target;
				try { target = absolute(record.url, base.href); }
				catch { problems.push(`${searchUrl.href}: invalid result URL ${record.url}`); continue; }
				if (!isInternal(target)) { problems.push(`${searchUrl.href}: search result escapes site base ${record.url}`); continue; }
				if (isPrivate(target)) problems.push(`${searchUrl.href}: indexes private path ${target.pathname}`);
				await checkLink(searchUrl.href, target.href, "search anchor");
			}
		} catch { problems.push(`${searchUrl.href}: invalid JSON search index`); }
	}

	const first = await fetchPage(base.href);
	for (const tag of tags(first.html)) {
		if (tag.name === "link" && tag.attributes.rel === "canonical" && tag.attributes.href) {
			try {
				const canonical = new URL(tag.attributes.href);
				if (canonical.pathname === base.pathname) siteOrigins.add(canonical.origin);
			} catch { /* Other URL checks report malformed links where relevant. */ }
		}
	}
	for (const entry of contract) {
		const target = new URL(entry.path.replace(/^\//, ""), base);
		if (!isInternal(target) || isPrivate(target)) throw new Error(`Manifest includes an invalid public route: ${entry.path}`);
		expected.set(target.href, entry.anchors);
		enqueue(target);
	}

	if (htmlBuildId || values["source-sha"]) {
		buildManifest = await readIdentity(htmlBuildId, values["source-sha"]);
		htmlBuildId ??= buildManifest?.build_id;
	}
	await checkSearch(values["search-index"]);
	// The site's own not-found page is public too; check its links and assets.
	const notFoundUrl = new URL("404.html", base);
	const notFound = await fetchPage(notFoundUrl.href);
	if (notFound.status === 200 && notFound.html) enqueue(notFoundUrl);

	while (queue.length) {
		const url = queue.shift();
		if (processed.has(url)) continue;
		processed.add(url);
		const page = await fetchPage(url);
		if (page.status !== 200) { problems.push(`${url}: HTTP ${page.status}`); continue; }
		if (!page.html) {
			if (expected.has(url) || url === base.href) problems.push(`${url}: expected an HTML page`);
			continue;
		}
		if (values.expect !== undefined && !page.html.includes(values.expect)) problems.push(`${url}: missing expected text "${values.expect}"`);
		scanLeaks(url, page.html);
		const present = ids(page.html);
		for (const anchor of expected.get(url) ?? []) if (!present.has(anchor)) problems.push(`${url}: required route-contract anchor #${anchor} not on the page`);
		const elements = tags(page.html);
		const meta = new Map(elements.filter(tag => tag.name === "meta").map(tag => [tag.attributes.name?.toLowerCase(), tag.attributes.content ?? ""]));
		// The site's own not-found page may stay out of search; every other page must be indexable.
		if (url !== notFoundUrl.href && /(?:^|[\s,])noindex(?:[\s,]|$)/i.test(meta.get("robots") ?? "")) problems.push(`${url}: production page must be indexable, found noindex`);
		if (htmlBuildId && meta.get("docs-build-id") !== htmlBuildId) problems.push(`${url}: build meta does not match ${htmlBuildId}`);
		if (buildManifest && meta.get("docs-source-sha") !== buildManifest.source_commit) problems.push(`${url}: source meta does not match build manifest`);
		for (const tag of elements) if (tag.name === "a" && tag.attributes.href) await checkLink(url, tag.attributes.href);
		const assets = [];
		for (const tag of elements) {
			const attributes = tag.attributes;
			if (["img", "script", "source"].includes(tag.name) && attributes.src) assets.push([attributes.src, tag.name === "img"]);
			if (tag.name === "link" && /^(?:stylesheet|icon|apple-touch-icon|preload|modulepreload)$/.test(attributes.rel ?? "") && attributes.href) assets.push([attributes.href, attributes.as === "image" || /icon/.test(attributes.rel)]);
			if ((tag.name === "img" || tag.name === "source") && attributes.srcset && !attributes.srcset.startsWith("data:")) {
				for (const candidate of attributes.srcset.split(",")) {
					const src = candidate.trim().split(/\s+/)[0];
					if (src) assets.push([src, true]);
				}
			}
		}
		// Keep network concurrency bounded while avoiding repeated image requests.
		for (let index = 0; index < assets.length; index += 6) {
			await Promise.all(assets.slice(index, index + 6).map(([src, image]) => checkAsset(url, src, image)));
		}
	}

	for (const relative of PRIVATE) {
		const target = new URL(relative, base);
		const response = await fetchPage(target.href);
		if (response.status !== 404) problems.push(`private path ${target.pathname}: HTTP ${response.status}, expected 404`);
	}
	// A missing route answers a real 404. When the site ships its own not-found
	// page, that page is what a reader sees there.
	const missing = await fetchPage(new URL(`docs-crawl-missing-${Date.now().toString(36)}.html`, base).href);
	if (missing.status !== 404) problems.push(`missing page: HTTP ${missing.status}, expected 404`);
	if (notFound.status === 200 && notFound.html && !values["host-404"]) {
		const title = /<title>([^<]*)<\/title>/i.exec(notFound.html)?.[1];
		if (title && !missing.html.includes(`<title>${title}</title>`)) problems.push(`missing page: does not serve the site's 404.html (${title})`);
	}
	const pages = [...seen.entries()].filter(([, entry]) => entry.html && entry.status === 200);
	console.log(`crawled ${pages.length} pages, ${seen.size} URLs under ${base.href}`);
	for (const [url, entry] of seen) if (entry.html) console.log(`  ${entry.status} ${new URL(url).pathname}`);
	if (problems.length) {
		console.error(`\n${problems.length} problem(s):`);
		for (const problem of problems) console.error(`  ${problem}`);
		process.exitCode = 1;
	} else {
		console.log(`\nDOCS CRAWL: no broken links, images or anchors; private paths answer 404; search index checked${values.manifest ? "; route contract checked" : ""}${htmlBuildId ? `; build ${htmlBuildId} checked` : ""}`);
	}
}

main().catch(error => { console.error(error.message); process.exitCode = 2; });
