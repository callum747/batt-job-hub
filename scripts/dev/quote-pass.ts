// Dev tool: works out one pass of edits for the short-form quote from a real document's JSON.
// Usage: npx tsx scripts/dev/quote-pass.ts <structure|text|style|check> <doc.json> <quote.json> [styles.json] [short|survey|long|invoice]
// "structure" also writes the template's row styles to styles.json (needed by "style").
import { readFileSync, writeFileSync } from "node:fs";
import * as docsModule from "../../src/lib/docs";
import * as quoteModule from "../../src/lib/quote-short";
import * as surveyModule from "../../src/lib/quote-survey";
import * as longModule from "../../src/lib/quote-long";
import * as invoiceModule from "../../src/lib/invoice-doc";

// tsx can hand back the module's exports under "default" when the project isn't an ES module.
const { leftoverPlaceholders } = ((docsModule as unknown as { default?: typeof docsModule }).default ?? docsModule) as typeof docsModule;
const { captureRowStyles, checkShortQuote, structurePass, stylePass, textPass } = ((quoteModule as unknown as { default?: typeof quoteModule }).default ?? quoteModule) as typeof quoteModule;

const [pass, docPath, quotePath, stylesPath = "styles.json", kind = "short"] = process.argv.slice(2);
const sv = ((surveyModule as unknown as { default?: typeof surveyModule }).default ?? surveyModule) as typeof surveyModule;
const lg = ((longModule as unknown as { default?: typeof longModule }).default ?? longModule) as typeof longModule;
const iv = ((invoiceModule as unknown as { default?: typeof invoiceModule }).default ?? invoiceModule) as typeof invoiceModule;
const F = kind === "invoice"
  ? { check: iv.checkInvoiceDoc, capture: () => ({}), structure: iv.invoiceStructurePass, text: iv.invoiceTextPass, style: () => [] }
  : kind === "long"
  ? { check: lg.checkLongQuote, capture: lg.captureLongStyles, structure: lg.longStructurePass, text: lg.longTextPass, style: lg.longStylePass }
  : kind === "survey"
  ? { check: sv.checkSurveyQuote, capture: sv.captureSurveyStyles, structure: sv.surveyStructurePass, text: sv.surveyTextPass, style: sv.surveyStylePass }
  : null;
const raw = JSON.parse(readFileSync(docPath, "utf8"));
// Accept the documents.get JSON directly, or wrapped by a tool.
const inner = raw.body ? raw : raw.document ?? raw.content ?? raw;
// A read that includes tabs puts the body inside the first tab.
const doc = inner.body ? inner : { ...inner, ...(inner.tabs?.[0]?.documentTab ?? {}) };
const quote = JSON.parse(readFileSync(quotePath, "utf8"));

const problems = F ? F.check(quote) : checkShortQuote(quote);
if (problems.length) throw new Error("Quote content problems: " + problems.join(" | "));

let out: unknown;
if (pass === "structure") {
  writeFileSync(stylesPath, JSON.stringify(F ? F.capture(doc) : captureRowStyles(doc)));
  out = F ? F.structure(doc, quote) : structurePass(doc, quote);
} else if (pass === "text") out = F ? F.text(doc, quote) : textPass(doc, quote);
else if (pass === "style") out = F ? F.style(doc, quote, JSON.parse(readFileSync(stylesPath, "utf8"))) : stylePass(doc, quote, JSON.parse(readFileSync(stylesPath, "utf8")));
else if (pass === "check") out = { leftovers: leftoverPlaceholders(doc) };
else throw new Error("pass must be structure, text, style or check");
process.stdout.write(JSON.stringify(out));
