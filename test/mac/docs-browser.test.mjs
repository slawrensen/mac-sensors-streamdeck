// Real generated-site browser checks, separate from plugin release gates. The
// journeys follow slawrensen/hwinfo-streamdeck test/docs-browser.test.mjs at
// 022cb3f where they apply to the Mac docs, driven through scripts/lib/cdp.mjs.
//
//   DOCS_TEST_URL=http://127.0.0.1:4173/mac-streamdeck/ node --test test/mac/docs-browser.test.mjs
//
// Serve a Jekyll build beneath its base path (or use the published site). Set
// CHROME for a custom browser. Without DOCS_TEST_URL every test reports UNAVAILABLE.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { launch } from "../../scripts/lib/cdp.mjs";

const base = process.env.DOCS_TEST_URL ? new URL(process.env.DOCS_TEST_URL.endsWith("/") ? process.env.DOCS_TEST_URL : `${process.env.DOCS_TEST_URL}/`) : null;
const options = { skip: base ? false : "UNAVAILABLE: set DOCS_TEST_URL to a served Jekyll build or the published site", timeout: 60_000 };
const PAGES = ["", "installation.html", "getting-started.html", "sensor-reading.html", "sensor-details.html", "sensor-dial.html", "dial-controls.html", "themes.html", "thresholds.html", "data-sources.html", "status-screens.html", "hardware.html", "faq.html", "troubleshooting.html", "changelog.html"];
let browser;
let exceptions = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const siteUrl = (relative = "") => new URL(relative, base).href;

before(async () => {
	if (!base) return;
	browser = await launch({ width: 1280, height: 800 });
	browser.on("Runtime.exceptionThrown", event => exceptions.push(event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text ?? "exception"));
});
after(async () => { await browser?.close(); });

async function open(relative, { width = 1280, height = 800, script = true } = {}) {
	await browser.send("Emulation.setScriptExecutionDisabled", { value: !script });
	await browser.viewport(width, height);
	exceptions = [];
	await browser.goto(siteUrl(relative));
	await waitFor("document.readyState === 'complete'");
	if (script) await waitFor("document.documentElement.classList.contains('docs-js') && !!document.querySelector('#main-content')");
}

async function waitFor(expression, timeout = 5000) {
	const deadline = Date.now() + timeout;
	for (;;) {
		if (await browser.evaluate(`Boolean(${expression})`)) return;
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${expression}`);
		await sleep(25);
	}
}

for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
	test(`every route has one h1, a working skip target, described images and no sideways overflow at ${viewport.width}px`, options, async () => {
		for (const page of [...PAGES, "404.html"]) {
			await open(page, viewport);
			const facts = await browser.evaluate(`(async () => {
				for (const image of document.images) { image.loading = "eager"; try { await image.decode(); } catch {} }
				return {
					lang: document.documentElement.lang,
					title: document.title,
					description: document.querySelector('meta[name="description"]')?.content ?? "",
					h1: document.querySelectorAll("h1").length,
					skip: document.querySelector("a.skip-to-main")?.getAttribute("href"),
					main: !!document.getElementById("main-content"),
					overflow: document.documentElement.scrollWidth - window.innerWidth,
					broken: [...document.images].filter(image => !image.complete || image.naturalWidth === 0).map(image => image.getAttribute("src")),
					unlabeled: [...document.querySelectorAll(".main-content img")].filter(image => !image.alt.trim()).map(image => image.getAttribute("src")),
					brand: document.querySelector(".brand-mark")?.getAttribute("alt")
				};
			})()`);
			assert.equal(facts.lang, "en", page);
			assert.match(facts.title, /\| Mac Sensors$/, page);
			assert.ok(facts.description.length > 20, `${page} has its own description`);
			assert.equal(facts.h1, 1, `${page} has exactly one h1`);
			assert.equal(facts.skip, "#main-content", page);
			assert.ok(facts.main, page);
			assert.ok(facts.overflow <= 1, `${page} overflows sideways by ${facts.overflow}px`);
			assert.deepEqual(facts.broken, [], `${page} images load`);
			assert.deepEqual(facts.unlabeled, [], `${page} article images have alt text`);
			assert.equal(facts.brand, "", "the decorative brand mark is skipped; the link text names the site");
			assert.deepEqual(exceptions, [], `${page} runs without script errors`);
		}
	});
}

test("text and controls keep a 14px minimum and WCAG AA contrast against their surfaces", options, async () => {
	for (const [page, width] of [["", 1280], ["troubleshooting.html", 1280], ["themes.html", 390]]) {
		await open(page, { width, height: 800 });
		const failures = await browser.evaluate(`(() => {
			const channel = value => { value /= 255; return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };
			const parse = color => (color.match(/[\\d.]+/g) ?? []).map(Number);
			const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
			const surface = element => {
				for (let node = element; node; node = node.parentElement) {
					const [r, g, b, a = 1] = parse(getComputedStyle(node).backgroundColor);
					if (a >= 0.99 && getComputedStyle(node).backgroundColor !== "rgba(0, 0, 0, 0)") return [r, g, b];
				}
				return parse(getComputedStyle(document.body).backgroundColor);
			};
			const selector = ".main-content p, .main-content li, .main-content td, .main-content th, .main-content figcaption, .main-content a, .main-content code, .eyebrow, .release-note, .nav-list-link, .nav-group-title, .site-footer a, .site-footer span, .docs-footer p, .docs-footer a, .gallery-position, .search-input, .button";
			const out = [];
			for (const element of document.querySelectorAll(selector)) {
				if (!element.textContent.trim() && element.tagName !== "INPUT") continue;
				const box = element.getBoundingClientRect();
				if (!box.width || !box.height || getComputedStyle(element).visibility === "hidden") continue;
				const style = getComputedStyle(element);
				const size = Number.parseFloat(style.fontSize);
				const text = luminance(parse(style.color)), back = luminance(surface(element));
				const ratio = (Math.max(text, back) + 0.05) / (Math.min(text, back) + 0.05);
				const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
				if (size < 14) out.push(element.tagName + "." + element.className + " " + size + "px");
				if (ratio < (large ? 3 : 4.5)) out.push(element.tagName + "." + element.className + " contrast " + ratio.toFixed(2) + ": " + element.textContent.trim().slice(0, 40));
			}
			return [...new Set(out)];
		})()`);
		assert.deepEqual(failures, [], `${page || "home"} at ${width}px`);
	}
});

test("the skip link is the first keyboard stop and moves focus to the article", options, async () => {
	await open("sensor-reading.html");
	await browser.key("Tab");
	const skip = await browser.evaluate(`(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { cls: a.className, visible: r.top >= 0 && r.bottom <= innerHeight && r.width > 0, outline: getComputedStyle(a).outlineStyle }; })()`);
	assert.equal(skip.cls, "skip-to-main");
	assert.ok(skip.visible, "the focused skip link is visible");
	await browser.key("Enter");
	await waitFor("document.activeElement?.id === 'main-content'");
	await browser.key("Tab");
	assert.equal(await browser.evaluate("document.getElementById('main-content').contains(document.activeElement)"), true, "the next stop is inside the article, not the navigation");
});

test("home gallery browses and expands without moving its controls", options, async () => {
	await open("", { width: 1280, height: 800 });
	await waitFor("!document.querySelector('.gallery-controls').hidden");
	const controlsTop = () => browser.evaluate("document.querySelector('.gallery-controls').getBoundingClientRect().top + scrollY");
	const first = await controlsTop();
	assert.match(await browser.evaluate("document.querySelector('[data-gallery-position]').textContent"), /^Every action · 1 \/ 5$/);
	for (let index = 2; index <= 5; index++) {
		await browser.click("[data-gallery-next]");
		await waitFor(`document.querySelector('[data-gallery-position]').textContent.endsWith('${index} / 5')`);
		assert.equal(await controlsTop(), first, `slide ${index} keeps the controls in place`);
		assert.equal(await browser.evaluate("[...document.querySelectorAll('[data-gallery-slide]')].filter(slide => !slide.hidden).length"), 1);
	}
	await browser.click("[data-gallery-next]");
	await waitFor("document.querySelector('[data-gallery-position]').textContent.endsWith('1 / 5')");
	await browser.click("[data-gallery-expand]");
	await waitFor("document.querySelector('dialog.image-viewer')?.open");
	await waitFor("document.querySelector('.viewer-stage img')?.complete && !document.querySelector('.viewer-stage img').hidden");
	assert.match(await browser.evaluate("document.querySelector('.viewer-caption').textContent"), /^Production-rendered sample data/);
	assert.equal(await browser.evaluate("document.querySelector('.viewer-position').textContent"), "1 / 5");
	await browser.key("ArrowRight");
	await waitFor("document.querySelector('.viewer-position').textContent === '2 / 5'");
	await browser.key("Escape");
	await waitFor("!document.querySelector('dialog.image-viewer').open");
	assert.equal(await browser.evaluate("document.activeElement?.matches('[data-gallery-expand]')"), true, "focus returns to Expand");
	assert.match(await browser.evaluate("document.querySelector('[data-gallery-position]').textContent"), /2 \/ 5$/, "the gallery follows the image browsed in the viewer");
});

test("an article image opens the native viewer, keeps focus inside and restores its opener", options, async () => {
	await open("themes.html", { width: 1280, height: 800 });
	await waitFor("document.querySelector('.main-content a.image-link[data-image-viewer]')");
	await browser.click(".main-content a.image-link[data-image-viewer]");
	await waitFor("document.querySelector('dialog.image-viewer')?.open");
	assert.match(await browser.evaluate("document.querySelector('.viewer-caption').textContent"), /^The same CPU super 1 key/);
	for (let index = 0; index < 6; index++) {
		await browser.key("Tab", { shift: index % 2 === 1 });
		assert.equal(await browser.evaluate("document.querySelector('dialog.image-viewer').contains(document.activeElement)"), true, "focus stays inside the modal");
	}
	await browser.click("[data-viewer-toggle]");
	assert.equal(await browser.evaluate("document.querySelector('.viewer-stage').classList.contains('is-full')"), true, "Actual size shows the recorded pixels");
	await browser.key("Escape");
	await waitFor("!document.querySelector('dialog.image-viewer').open");
	assert.equal(await browser.evaluate("document.activeElement?.matches('.main-content a.image-link')"), true);
	assert.equal(await browser.evaluate("document.body.style.overflow"), "", "page scrolling is restored");
});

test("settings-panel captures show at the recorded panel width and boards fill the column", options, async () => {
	await open("sensor-reading.html", { width: 1280, height: 800 });
	const widths = await browser.evaluate(`(() => Object.fromEntries([...document.querySelectorAll(".main-content img")].map(image => [image.getAttribute("src").split("/").pop(), Math.round(image.getBoundingClientRect().width)])))()`);
	assert.equal(widths["settings-key.png"], 378);
	assert.ok(widths["key-layouts.png"] > 700, "boards keep the content width");
});

test("search finds a setting, Ctrl+K focuses it and results stay inside the site", options, async () => {
	await open("installation.html");
	await browser.key("k", { ctrl: true });
	await waitFor("document.activeElement?.id === 'search-input'");
	await browser.type("Tahoma");
	await waitFor("document.querySelectorAll('#search-results .search-result').length > 0", 8000);
	const links = await browser.evaluate("[...document.querySelectorAll('#search-results a')].map(a => a.href)");
	assert.ok(links.length > 0);
	for (const link of links) assert.ok(link.startsWith(base.href), `${link} stays under ${base.href}`);
	await waitFor("/\\d+ search results?/.test(document.getElementById('search-status').textContent)", 3000);
	await browser.key("Escape");
	await waitFor("document.getElementById('search-input').value === ''");
});

test("phone navigation opens from Menu and closes with Escape", options, async () => {
	await open("faq.html", { width: 390, height: 844 });
	assert.equal(await browser.evaluate("getComputedStyle(document.getElementById('site-nav')).display"), "none", "navigation starts collapsed");
	await browser.click("#menu-button");
	await waitFor("getComputedStyle(document.getElementById('site-nav')).display !== 'none'");
	assert.equal(await browser.evaluate("document.getElementById('menu-button').getAttribute('aria-expanded')"), "true");
	assert.equal(await browser.evaluate("document.querySelector('#site-nav a[aria-current=page]')?.textContent"), "FAQ and privacy");
	await browser.key("Escape");
	await waitFor("getComputedStyle(document.getElementById('site-nav')).display === 'none'");
	assert.equal(await browser.evaluate("document.activeElement?.id"), "menu-button");
});

test("navigation, articles and full-image links work without JavaScript", options, async () => {
	try {
		await open("sensor-dial.html", { width: 390, height: 844, script: false });
		const facts = await browser.evaluate(`({
			nav: getComputedStyle(document.getElementById("site-nav")).display,
			links: document.querySelectorAll("#site-nav a").length,
			headings: document.querySelectorAll(".main-content h2").length,
			images: [...document.querySelectorAll(".main-content img")].length
		})`);
		assert.notEqual(facts.nav, "none", "the navigation is visible without the menu script");
		assert.equal(facts.links, 15);
		assert.ok(facts.headings > 3);
		assert.ok(facts.images > 0);
		await open("", { width: 1280, height: 800, script: false });
		assert.equal(await browser.evaluate("[...document.querySelectorAll('[data-gallery-slide]')].filter(slide => slide.getBoundingClientRect().height > 0).length"), 5, "every gallery image is shown without script");
	} finally {
		await browser.send("Emulation.setScriptExecutionDisabled", { value: false });
	}
});

test("a missing page shows the site's not-found page with its navigation", options, async () => {
	await open("this-page-does-not-exist.html");
	assert.match(await browser.evaluate("document.title"), /^Page not found/);
	assert.ok(await browser.evaluate("document.querySelectorAll('.main-content a').length >= 4"));
	const links = await browser.evaluate("[...document.querySelectorAll('.main-content a, #site-nav a')].map(a => a.href)");
	for (const link of links) assert.ok(link.startsWith(base.href), `${link} resolves under the base path from a missing URL`);
});

test("page contents sits beside long articles on wide screens and folds on phones", options, async () => {
	await open("troubleshooting.html", { width: 1700, height: 900 });
	await waitFor("!document.querySelector('.page-toc').hidden");
	assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('.page-toc')).position"), "sticky");
	assert.equal(await browser.evaluate("document.querySelector('.page-toc details').open"), true);
	await open("troubleshooting.html", { width: 390, height: 844 });
	await waitFor("!document.querySelector('.page-toc').hidden");
	assert.equal(await browser.evaluate("document.querySelector('.page-toc details').open"), false);
});

for (const [viewport, target] of [[{ width: 1280, height: 800 }, "themes.html#type-accents"], [{ width: 390, height: 844 }, "dial-controls.html#the-sensor-control-key-action"]]) {
	test(`a direct heading link lands just below the sticky header at ${viewport.width}px`, options, async () => {
		await open(target, viewport);
		await sleep(200);
		const position = await browser.evaluate(`(() => ({ heading: document.getElementById(location.hash.slice(1)).getBoundingClientRect().top, header: document.getElementById("main-header").getBoundingClientRect().bottom }))()`);
		assert.ok(position.heading >= position.header - 1, `the heading (${position.heading}) is not under the header (${position.header})`);
		assert.ok(position.heading <= position.header + 64, "the heading starts near the top of the reading area");
	});
}

test("reference tables stack into labeled rows on phones and stay tables on desktop", options, async () => {
	await open("", { width: 390, height: 844 });
	const phone = await browser.evaluate(`(() => { const table = [...document.querySelectorAll(".main-content table")].find(item => item.tHead.textContent.includes("What you see")); const cell = table.tBodies[0].rows[0].cells[1]; return { stacked: table.classList.contains("stacked"), role: table.getAttribute("role"), cellRole: cell.getAttribute("role"), label: cell.querySelector(".cell-label")?.textContent, hidden: cell.querySelector(".cell-label")?.getAttribute("aria-hidden"), wrapperOverflow: table.parentElement.scrollWidth - table.parentElement.clientWidth, height: Math.round(table.getBoundingClientRect().height) }; })()`);
	assert.deepEqual({ ...phone, height: undefined }, { stacked: true, role: "table", cellRole: "cell", label: "What you see", hidden: "true", wrapperOverflow: 0, height: undefined });
	assert.ok(phone.height < 4000, `the stacked change table stays readable (${phone.height}px)`);
	await open("", { width: 1280, height: 800 });
	assert.equal(await browser.evaluate("document.querySelector('.main-content table.stacked')"), null);
	assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('.main-content .cell-label')).display"), "none");
});
