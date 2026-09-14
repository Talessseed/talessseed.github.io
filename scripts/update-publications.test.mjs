import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { updatePublications } from "./update-publications.mjs";

const SOURCE = "https://dblp.org/pid/291/6764.xml";
const MIRROR = "https://dblp.uni-trier.de/pid/291/6764.xml";
const ORIGINAL_HTML = "<main>\n<!-- PUBLICATIONS:START -->\nExisting publications\n<!-- PUBLICATIONS:END -->\n</main>\n";
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<dblpperson pid="291/6764" name="Timothé Picavet" n="1">
  <r><inproceedings key="conf/example/Picavet26">
    <author pid="291/6764">Timothé Picavet</author>
    <author pid="12/3456">A. Coauthor</author>
    <title>Graphs &amp; Algorithms.</title>
    <year>2026</year><booktitle>Example Conference</booktitle>
    <ee>https://doi.org/10.1234/example</ee>
  </inproceedings></r>
</dblpperson>`;
const BOT_HTML = "<!doctype html><html><head><title>Making sure you're not a bot!</title></head><body>Loading...</body></html>";

async function setup(t, { required = true } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "dblp-update-test-"));
  const target = join(directory, "publications.html");
  await writeFile(target, ORIGINAL_HTML);
  const previousEnv = Object.fromEntries(
    ["DBLP_XML_SOURCE", "DBLP_REFRESH_REQUIRED"].map((name) => [name, process.env[name]]),
  );
  delete process.env.DBLP_XML_SOURCE;
  process.env.DBLP_REFRESH_REQUIRED = String(required);
  t.after(async () => {
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  });
  t.mock.method(console, "log", () => {});
  const warnings = t.mock.method(console, "warn", () => {});
  return { directory, target, warnings };
}

function mockResponses(t, responses) {
  let index = 0;
  return t.mock.method(globalThis, "fetch", async (...args) => {
    assert.ok(index < responses.length, "unexpected additional HTTP request");
    const response = responses[index++];
    if (typeof response === "function") return response(...args);
    return response;
  });
}

function xmlResponse() {
  return new Response(XML, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}

test("a direct XML response updates only the publication region and is idempotent", async (t) => {
  const { target } = await setup(t);
  const fetchMock = mockResponses(t, [xmlResponse(), xmlResponse()]);
  assert.equal(await updatePublications({ target }), true);
  const updated = await readFile(target, "utf8");
  assert.match(updated, /Graphs &amp; Algorithms\./);
  assert.match(updated, /with <a href="https:\/\/dblp.org\/pid\/12\/3456.html">A\. Coauthor<\/a>/);
  assert.doesNotMatch(updated, /Timothé|Existing publications/);
  assert.ok(updated.startsWith("<main>\n<!-- PUBLICATIONS:START -->\n"));
  assert.ok(updated.endsWith("<!-- PUBLICATIONS:END -->\n</main>\n"));
  assert.equal(await updatePublications({ target }), true);
  assert.equal(await readFile(target, "utf8"), updated);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("follows Anubis HTML meta refresh and retains cookies through the HTTP redirect", async (t) => {
  const { target } = await setup(t);
  const challengePath = "/.within.website/x/cmd/anubis/api/pass-challenge?challenge=example&id=test&redir=%2Fpid%2F291%2F6764.xml";
  const fetchMock = mockResponses(t, [
    new Response(BOT_HTML.replace("</body>", `<meta http-equiv="refresh" content="0; url=${challengePath.replaceAll("&", "&amp;")}"></body>`), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": "dblp_org-cookie-verification-8702d140=verification; Path=/; HttpOnly; Secure",
      },
    }),
    (url, options) => {
      assert.equal(url, `https://dblp.org${challengePath}`);
      assert.equal(options.redirect, "manual");
      assert.equal(options.headers.Cookie, "dblp_org-cookie-verification-8702d140=verification");
      const headers = new Headers({ Location: "/pid/291/6764.xml" });
      headers.append("Set-Cookie", "dblp_org-auth-8702d140=token=with=padding; Path=/; HttpOnly; Secure");
      headers.append("Set-Cookie", "dblp_org-cookie-verification-8702d140=; Path=/; Max-Age=0");
      return new Response("Redirecting", { status: 302, headers });
    },
    (url, options) => {
      assert.equal(url, SOURCE);
      assert.equal(options.headers.Cookie, "dblp_org-auth-8702d140=token=with=padding");
      return xmlResponse();
    },
  ]);
  assert.equal(await updatePublications({ target }), true);
  assert.equal(fetchMock.mock.callCount(), 3);
  assert.match(await readFile(target, "utf8"), /Graphs &amp; Algorithms/);
});

test("honors Anubis's Refresh response header and requested wait", async (t) => {
  const { target } = await setup(t);
  let startedAt;
  mockResponses(t, [
    () => {
      startedAt = performance.now();
      return new Response(BOT_HTML, {
        headers: {
          Refresh: '0.05; url="/pass-challenge?id=test&challenge=example"',
          "Set-Cookie": "verification=test; Path=/",
        },
      });
    },
    (url, options) => {
      assert.ok(performance.now() - startedAt >= 45, "the requested delay must be respected");
      assert.equal(url, "https://dblp.org/pass-challenge?id=test&challenge=example");
      assert.equal(options.headers.Cookie, "verification=test");
      return xmlResponse();
    },
  ]);
  assert.equal(await updatePublications({ target }), true);
});

test("falls back to the mirror without forwarding the first source's cookies", async (t) => {
  const { target, warnings } = await setup(t);
  mockResponses(t, [
    new Response(BOT_HTML, { headers: { "Set-Cookie": "verification=primary; Path=/" } }),
    (url, options) => {
      assert.equal(url, MIRROR);
      assert.equal(options.headers.Cookie, undefined);
      return xmlResponse();
    },
  ]);
  assert.equal(await updatePublications({ target }), true);
  assert.match(warnings.mock.calls[0].arguments[0], /HTML page.*bot check/);
});

test("a scheduled refresh still fails without changing the snapshot when both sources fail", async (t) => {
  const { target } = await setup(t);
  mockResponses(t, [new Response(BOT_HTML), new Response("Unavailable", { status: 503 })]);
  await assert.rejects(updatePublications({ target }), /aborting this scheduled deployment/);
  assert.equal(await readFile(target, "utf8"), ORIGINAL_HTML);
});

test("an optional refresh retains the snapshot when DBLP is unavailable", async (t) => {
  const { target } = await setup(t, { required: false });
  mockResponses(t, [new Response(BOT_HTML), new Response(BOT_HTML)]);
  assert.equal(await updatePublications({ target }), false);
  assert.equal(await readFile(target, "utf8"), ORIGINAL_HTML);
});

for (const kind of ["http", "refresh"]) {
  test(`rejects a cross-origin ${kind} redirect before sending session cookies`, async (t) => {
    const { target, warnings } = await setup(t);
    const headers = { "Set-Cookie": "verification=private; Path=/" };
    const response = kind === "http"
      ? new Response("", { status: 302, headers: { ...headers, Location: "https://example.com/collect" } })
      : new Response(BOT_HTML, { headers: { ...headers, Refresh: "0; url=https://example.com/collect" } });
    const fetchMock = mockResponses(t, [response]);
    await assert.rejects(updatePublications({ source: SOURCE, target }), /configured DBLP XML source/);
    assert.equal(fetchMock.mock.callCount(), 1);
    assert.match(warnings.mock.calls[0].arguments[0], /outside the source origin/);
    assert.equal(await readFile(target, "utf8"), ORIGINAL_HTML);
  });
}

test("bounds repeated bot-check refreshes", async (t) => {
  const { target, warnings } = await setup(t);
  const fetchMock = mockResponses(t, Array.from({ length: 6 }, () =>
    new Response(BOT_HTML, { headers: { Refresh: "0; url=/pid/291/6764.xml" } }),
  ));
  await assert.rejects(updatePublications({ source: SOURCE, target }), /configured DBLP XML source/);
  assert.equal(fetchMock.mock.callCount(), 6);
  assert.match(warnings.mock.calls[0].arguments[0], /exceeded the limit/);
  assert.equal(await readFile(target, "utf8"), ORIGINAL_HTML);
});

test("rejects excessive refresh delays without waiting", async (t) => {
  const { target, warnings } = await setup(t);
  const fetchMock = mockResponses(t, [new Response(BOT_HTML, { headers: { Refresh: "3600; url=/wait" } })]);
  await assert.rejects(updatePublications({ source: SOURCE, target }), /configured DBLP XML source/);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.match(warnings.mock.calls[0].arguments[0], /delay longer than/);
  assert.equal(await readFile(target, "utf8"), ORIGINAL_HTML);
});

test("invalid XML after a successful challenge cannot overwrite the snapshot", async (t) => {
  const { target } = await setup(t);
  mockResponses(t, [
    new Response(BOT_HTML, { headers: { Refresh: "0; url=/pass-challenge" } }),
    new Response(XML.replace("</dblpperson>", "")),
  ]);
  await assert.rejects(updatePublications({ source: SOURCE, target }), /configured DBLP XML source/);
  assert.equal(await readFile(target, "utf8"), ORIGINAL_HTML);
});

test("local XML overrides still work without any HTTP requests", async (t) => {
  const { directory, target } = await setup(t);
  const source = join(directory, "person.xml");
  await writeFile(source, XML);
  const fetchMock = mockResponses(t, []);
  assert.equal(await updatePublications({ source: pathToFileURL(source).href, target }), true);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.match(await readFile(target, "utf8"), /Graphs &amp; Algorithms/);
});
