import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const START_MARKER = "<!-- PUBLICATIONS:START -->";
const END_MARKER = "<!-- PUBLICATIONS:END -->";
const SITE_AUTHOR_PID = "291/6764";
const DEFAULT_SOURCES = [
  "https://dblp.org/pid/291/6764.xml",
  "https://dblp.uni-trier.de/pid/291/6764.xml",
];

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
        <h4 class="publication-title">${title}</h4>${authorLine}
        <p class="publication-details">${detailParts.join(" <span aria-hidden=\"true\">·</span> ")}</p>
      </article>
    </li>`;
      }).join("\n");

      return `<section class="publication-year" aria-labelledby="${yearId}">
  <h3 id="${yearId}">${escapeHtml(year)}</h3>
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

async function loadSource(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, {
      headers: {
        Accept: "application/xml, text/xml;q=0.9",
        "User-Agent": "timothe-picavet-publications-refresh/1.0",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return response.text();
  }

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
