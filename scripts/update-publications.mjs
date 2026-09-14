import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const START_MARKER = "<!-- PUBLICATIONS:START -->";
const END_MARKER = "<!-- PUBLICATIONS:END -->";
const SITE_AUTHOR_PID = "291/6764";
const DEFAULT_SOURCES = [
  "https://dblp.org/pid/291/6764.xml",
  "https://dblp.uni-trier.de/pid/291/6764.xml",
];
const HTTP_REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_SOURCE_REQUESTS = 6;
const MAX_REFRESH_DELAY_MS = 10_000;

const PUBLICATION_ELEMENTS = new Set([
  "article",
  "book",
  "incollection",
  "inproceedings",
  "mastersthesis",
  "phdthesis",
  "proceedings",
  "www",
]);

function decodeXmlEntities(value) {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };

  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z][\da-z]+));/gi,
    (entity, decimal, hexadecimal, named) => {
      if (named) {
        return namedEntities[named.toLowerCase()] ?? entity;
      }

      const codePoint = Number.parseInt(decimal ?? hexadecimal, hexadecimal ? 16 : 10);
      if (
        !Number.isInteger(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return "\uFFFD";
      }

      return String.fromCodePoint(codePoint);
    },
  );
}

function xmlText(value = "") {
  return decodeXmlEntities(
    value
      .replace(/<!--[^]*?-->/g, " ")
      .replace(/<!\[CDATA\[([^]*?)\]\]>/g, "$1")
      .replace(/<\/?(?:br|p)\b[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function parseAttributes(value = "") {
  const attributes = {};
  const pattern = /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

  for (const match of value.matchAll(pattern)) {
    attributes[match[1]] = decodeXmlEntities(match[2] ?? match[3] ?? "");
  }

  return attributes;
}

function allElements(xml, name) {
  const pattern = new RegExp(`<${name}\\b([^>]*)>([^]*?)<\\/${name}\\s*>`, "gi");
  return Array.from(xml.matchAll(pattern), (match) => ({
    attributes: parseAttributes(match[1]),
    content: match[2],
  }));
}

function firstElementText(xml, names) {
  for (const name of names) {
    const element = allElements(xml, name)[0];
    if (element) {
      const text = xmlText(element.content);
      if (text) return text;
    }
  }

  return "";
}

function authorUrl(pid) {
  if (!pid) return "";

  const path = pid
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");

  return path ? `https://dblp.org/pid/${path}.html` : "";
}

function primaryUrl(xml) {
  const candidate = firstElementText(xml, ["ee", "url"]);
  if (!candidate) return "";

  try {
    const url = new URL(candidate, "https://dblp.org/");
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function classifyPublication({ element, key, publtype, venue }) {
  const keyPrefix = key.split("/", 1)[0].toLowerCase();
  const isPreprint =
    publtype.toLowerCase() === "informal" ||
    key.toLowerCase().startsWith("journals/corr/") ||
    venue.toLowerCase() === "corr";

  if (isPreprint) return { cssClass: "preprint", label: "Preprint" };
  if (element === "phdthesis" || element === "mastersthesis" || keyPrefix === "phd") {
    return { cssClass: "phd", label: "Thesis" };
  }
  if (element === "inproceedings" || element === "proceedings" || keyPrefix === "conf") {
    return { cssClass: "conf", label: "Conference" };
  }
  if (element === "article" || keyPrefix === "journals") {
    return { cssClass: "journals", label: "Journal" };
  }
  if (element === "incollection") return { cssClass: "book", label: "Book chapter" };
  if (element === "book") return { cssClass: "book", label: "Book" };

  return { cssClass: "publication", label: "Publication" };
}

/**
 * Parse the subset of the DBLP person XML format needed by this site.
 * This intentionally has no runtime dependencies, so it can run on GitHub Pages builds.
 */
export function parseDblpXml(xml) {
  if (typeof xml !== "string" || !/<dblpperson\b/i.test(xml) || !/<\/dblpperson\s*>/i.test(xml)) {
    throw new Error("The response is not a DBLP person XML document.");
  }

  const recordOpenings = xml.match(/<r(?:\s[^>]*)?>/gi)?.length ?? 0;
  const records = allElements(xml, "r");
  if (recordOpenings === 0 || records.length !== recordOpenings) {
    throw new Error("The DBLP XML contains no complete publication records.");
  }

  return records.map((record, index) => {
    const publicationMatch = record.content.match(/<(\w+)\b([^>]*)>([^]*?)<\/\1\s*>/i);
    if (!publicationMatch || !PUBLICATION_ELEMENTS.has(publicationMatch[1].toLowerCase())) {
      throw new Error(`Unsupported publication record at position ${index + 1}.`);
    }

    const element = publicationMatch[1].toLowerCase();
    const attributes = parseAttributes(publicationMatch[2]);
    const content = publicationMatch[3];
    const title = firstElementText(content, ["title"]);
    const year = firstElementText(content, ["year"]);

    if (!title || !year) {
      throw new Error(`Publication record ${index + 1} has no title or year.`);
    }

    const authors = allElements(content, "author").map((author) => ({
      name: xmlText(author.content).replace(/\s+\d+$/, ""),
      pid: author.attributes.pid ?? "",
      url: authorUrl(author.attributes.pid),
    }));
    const venue = firstElementText(content, ["journal", "booktitle", "school", "publisher"]);
    const key = attributes.key ?? "";
    const publtype = attributes.publtype ?? "";
    const type = classifyPublication({ element, key, publtype, venue });

    return {
      authors,
      element,
      key,
      publtype,
      title,
      type,
      url: primaryUrl(content),
      venue,
      year,
    };
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function renderAuthors(authors) {
  const coauthors = authors.filter((author) => author.pid !== SITE_AUTHOR_PID);
  if (coauthors.length === 0) return "";

  return coauthors
    .map((author) => {
      const name = escapeHtml(author.name);
      return author.url
        ? `<a href="${escapeHtml(author.url)}">${name}</a>`
        : name;
    })
    .join(", ");
}

function compareYears(left, right) {
  const leftNumber = /^\d{4}$/.test(left) ? Number(left) : Number.NEGATIVE_INFINITY;
  const rightNumber = /^\d{4}$/.test(right) ? Number(right) : Number.NEGATIVE_INFINITY;
  if (leftNumber !== rightNumber) return rightNumber - leftNumber;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function renderPublications(publications) {
  const byYear = new Map();
  for (const publication of publications) {
    if (!byYear.has(publication.year)) byYear.set(publication.year, []);
    byYear.get(publication.year).push(publication);
  }

  return Array.from(byYear.keys())
    .sort(compareYears)
    .map((year) => {
      const yearId = `publications-${year.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}`;
      const items = byYear.get(year).map((publication) => {
        const title = escapeHtml(publication.title);
        const authors = renderAuthors(publication.authors);
        const venue = publication.venue
          ? `<em class="publication-venue">${escapeHtml(publication.venue)}</em>`
          : "";
        const detailParts = [venue, `<span class="publication-type">${escapeHtml(publication.type.label)}</span>`]
          .filter(Boolean);
        if (publication.url) {
          const linkText = publication.type.cssClass === "preprint" ? "arXiv" : "Paper";
          detailParts.push(`<a class="publication-link" href="${escapeHtml(publication.url)}">${linkText}</a>`);
        }

        const authorLine = authors
          ? `\n        <p class="publication-authors">with ${authors}</p>`
          : "";

        return `    <li class="publication-entry ${escapeHtml(publication.type.cssClass)}" data-dblp-type="${escapeHtml(publication.element)}">
      <article>
        <h3 class="publication-title">${title}</h3>${authorLine}
        <p class="publication-details">${detailParts.join(" <span aria-hidden=\"true\">·</span> ")}</p>
      </article>
    </li>`;
      }).join("\n");

      return `<section class="publication-year" aria-labelledby="${yearId}">
  <h2 id="${yearId}">${escapeHtml(year)}</h2>
  <ul class="publication-list">
${items}
  </ul>
</section>`;
    })
    .join("\n");
}

export function replacePublicationsRegion(html, renderedPublications) {
  const start = html.indexOf(START_MARKER);
  const end = html.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`publications.html must contain ${START_MARKER} followed by ${END_MARKER}.`);
  }
  if (html.indexOf(START_MARKER, start + START_MARKER.length) !== -1 ||
      html.indexOf(END_MARKER, end + END_MARKER.length) !== -1) {
    throw new Error("publications.html must contain exactly one publication marker pair.");
  }

  const newline = html.includes("\r\n") ? "\r\n" : "\n";
  const lineStart = html.lastIndexOf("\n", start) + 1;
  const markerIndentCandidate = html.slice(lineStart, start);
  const markerIndent = /^[\t ]*$/.test(markerIndentCandidate) ? markerIndentCandidate : "";
  const indentedBlock = renderedPublications
    .split("\n")
    .map((line) => `${markerIndent}${line}`)
    .join(newline);

  return `${html.slice(0, start + START_MARKER.length)}${newline}${indentedBlock}${newline}${markerIndent}${html.slice(end)}`;
}

function refreshInstruction(headers, html) {
  let refresh = headers.get("refresh");
  if (!refresh) {
    for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
      const attributes = Object.fromEntries(
        Object.entries(parseAttributes(match[1])).map(([name, value]) => [name.toLowerCase(), value]),
      );
      if (attributes["http-equiv"]?.toLowerCase() === "refresh") {
        refresh = attributes.content;
        break;
      }
    }
  }

  const match = refresh?.match(/^\s*(\d+(?:\.\d+)?)\s*;\s*url\s*=\s*(.+?)\s*$/i);
  if (!match) return null;

  const waitMs = Number(match[1]) * 1000;
  if (waitMs > MAX_REFRESH_DELAY_MS) {
    throw new Error(`DBLP requested a refresh delay longer than ${MAX_REFRESH_DELAY_MS / 1000} seconds.`);
  }

  return { waitMs, location: match[2].replace(/^(["'])(.*)\1$/, "$2") };
}

async function loadRemoteSource(source) {
  const origin = new URL(source).origin;
  const cookies = new Map();
  // Bound the whole exchange, including the wait and XML response body.
  const signal = AbortSignal.timeout(60_000);
  let url = source;

  for (let request = 0; request < MAX_SOURCE_REQUESTS; request += 1) {
    const headers = {
      Accept: "application/xml, text/xml;q=0.9",
      "User-Agent": "timothe-picavet-publications-refresh/1.0",
    };
    if (cookies.size) {
      headers.Cookie = Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; ");
    }

    // fetch does not retain cookies or follow Refresh headers / HTML meta refreshes.
    // DBLP's Anubis interstitial needs both, including cookies on its HTTP redirect.
    const response = await fetch(url, { headers, redirect: "manual", signal });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator > 0) {
        const name = pair.slice(0, separator).trim();
        const value = pair.slice(separator + 1);
        if (!value || /;\s*max-age\s*=\s*0\s*(?:;|$)/i.test(cookie)) cookies.delete(name);
        else cookies.set(name, value);
      }
    }

    const body = await response.text();
    let location;
    let waitMs = 0;
    if (HTTP_REDIRECTS.has(response.status)) {
      location = response.headers.get("location");
      if (!location) throw new Error(`HTTP ${response.status} redirect has no Location header.`);
    } else {
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const isHtml = /^text\/html\b/i.test(response.headers.get("content-type") ?? "") ||
        /<(?:!doctype\s+html|html)\b/i.test(body);
      if (!isHtml) return body;

      const refresh = refreshInstruction(response.headers, body);
      if (!refresh) {
        throw new Error("DBLP returned an HTML page (possibly a bot check) instead of publication XML, with no supported refresh.");
      }
      ({ location, waitMs } = refresh);
      console.log("DBLP requested a browser-style refresh; waiting and retrying with its session cookies.");
    }

    const nextUrl = new URL(location, url);
    // Keep the temporary session cookies on this source only. The mirror gets its own session.
    if (nextUrl.origin !== origin || nextUrl.username || nextUrl.password) {
      throw new Error("Refusing a DBLP redirect outside the source origin or containing credentials.");
    }
    if (request === MAX_SOURCE_REQUESTS - 1) break;
    if (waitMs) await delay(waitMs, undefined, { signal });
    url = nextUrl.href;
  }

  throw new Error(`DBLP exceeded the limit of ${MAX_SOURCE_REQUESTS} requests while redirecting or checking the session.`);
}

async function loadSource(source) {
  if (/^https?:\/\//i.test(source)) return loadRemoteSource(source);

  const path = source.startsWith("file:") ? fileURLToPath(source) : resolve(source);
  return readFile(path, "utf8");
}

async function writeAtomically(path, content) {
  const temporaryPath = resolve(dirname(path), `.publications-${process.pid}.tmp`);
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, path);
}

export async function updatePublications({ source, target } = {}) {
  const overrideSource = source ?? process.env.DBLP_XML_SOURCE;
  const sources = overrideSource ? [overrideSource] : DEFAULT_SOURCES;
  let publications;
  let selectedSource;

  for (const candidate of sources) {
    try {
      const xml = await loadSource(candidate);
      publications = parseDblpXml(xml);
      selectedSource = candidate;
      break;
    } catch (error) {
      console.warn(`Could not load publications from ${candidate}: ${error.message}`);
    }
  }

  if (!publications) {
    if (overrideSource) {
      throw new Error("The configured DBLP XML source could not be loaded.");
    }

    if (process.env.DBLP_REFRESH_REQUIRED === "true") {
      throw new Error(
        "DBLP is unavailable; aborting this scheduled deployment to preserve the current live publication list.",
      );
    }

    console.warn("DBLP is unavailable; retaining the existing static publication list.");
    return false;
  }

  const targetPath = resolve(target ?? process.env.PUBLICATIONS_HTML ?? "publications.html");
  const currentHtml = await readFile(targetPath, "utf8");
  const updatedHtml = replacePublicationsRegion(currentHtml, renderPublications(publications));

  if (updatedHtml === currentHtml) {
    console.log(`Publications are already current (${publications.length} records from ${selectedSource}).`);
    return true;
  }

  await writeAtomically(targetPath, updatedHtml);
  console.log(`Updated ${targetPath} with ${publications.length} records from ${selectedSource}.`);
  return true;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  updatePublications().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
