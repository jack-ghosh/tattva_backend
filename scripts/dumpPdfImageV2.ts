// scripts/dumpPdfImageV2.ts
// Usage: tsx scripts/dumpPdfImageV2.ts input.pdf output.txt [splitRatio] [concurrency]
//
// Fixes the two-column interleaving problem that whole-page `--psm 1` OCR produces:
// tesseract's automatic layout detection frequently jumps between columns mid-page,
// scrambling question order and sometimes duplicating blocks across the column boundary.
//
// Strategy: render each page at high DPI, split it down the column gutter into
// left/right halves, OCR each half independently (so reading order within each
// half is guaranteed top-to-bottom), then concatenate left-column-text followed
// by right-column-text per page. Also emits a page-boundary marker compatible
// with the existing GK parser's page-sync logic.
//
// Pages are processed in parallel batches — each page's OCR is fully independent
// of every other page, so concurrency only affects speed, never correctness/order.
// Final output is still assembled in strict page order regardless of completion order.

import "dotenv/config";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import sharp from "sharp";

const DEFAULT_SPLIT_RATIO = 0.50; // confirmed via spot-check against real 929-page book
const DEFAULT_CONCURRENCY = 4;     // each page = 2 tesseract calls; 4 concurrent pages = ~8 tesseract procs

// ── Process a single page: split into columns, OCR each half ──────────────────

async function splitAndOcrPage(
  pageImgPath: string,
  pageNum: number,
  totalPages: number,
  tmpDir: string,
  splitRatio: number
): Promise<string> {
  const img = sharp(pageImgPath);
  const meta = await img.metadata();
  const w = meta.width!;
  const h = meta.height!;
  const mid = Math.round(w * splitRatio);

  const leftPath = path.join(tmpDir, `p${pageNum}-left.jpg`);
  const rightPath = path.join(tmpDir, `p${pageNum}-right.jpg`);

  await sharp(pageImgPath).extract({ left: 0, top: 0, width: mid, height: h }).toFile(leftPath);
  await sharp(pageImgPath).extract({ left: mid, top: 0, width: w - mid, height: h }).toFile(rightPath);

  const leftOutBase = path.join(tmpDir, `p${pageNum}-left`);
  const rightOutBase = path.join(tmpDir, `p${pageNum}-right`);

  // --psm 4: assume a single column of variable-sized text — correct now that
  // we've physically split the columns apart ourselves.
  execSync(`tesseract "${leftPath}" "${leftOutBase}" --psm 4`, { stdio: "ignore" });
  execSync(`tesseract "${rightPath}" "${rightOutBase}" --psm 4`, { stdio: "ignore" });

  const leftText = fs.existsSync(`${leftOutBase}.txt`) ? fs.readFileSync(`${leftOutBase}.txt`, "utf-8") : "";
  const rightText = fs.existsSync(`${rightOutBase}.txt`) ? fs.readFileSync(`${rightOutBase}.txt`, "utf-8") : "";

  // Page marker matches the format parseGkQuestions.ts already syncs on.
  const pageText = `-- ${pageNum} of ${totalPages} --\n${leftText}\n${rightText}\n`;

  // Clean up per-page temp images immediately so 929 pages don't pile up on disk.
  for (const f of [leftPath, rightPath, `${leftOutBase}.txt`, `${rightOutBase}.txt`]) {
    try { fs.unlinkSync(f); } catch {}
  }

  return pageText;
}

// ── Bounded-concurrency batch runner ───────────────────────────────────────────
// Note: results[i] is written by original index, so output order is always
// correct page order — regardless of which page's OCR finishes first.

async function runInBatches<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;

  async function runNext(): Promise<void> {
    const i = nextIndex++;
    if (i >= items.length) return;
    results[i] = await worker(items[i], i);
    completed++;
    process.stdout.write(`\rOCR'd page ${completed}/${items.length}`);
    return runNext();
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function ocrDumpTextV2(
  pdfPath: string,
  outputPath: string,
  splitRatio: number,
  concurrency: number
) {
  const tmpDir = path.join(os.tmpdir(), `ocr_pages_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  console.log(`Rendering pages at 200 DPI...`);
  execSync(`pdftoppm -jpeg -r 200 "${pdfPath}" "${tmpDir}/page"`);

  const files = fs.readdirSync(tmpDir).filter(f => /^page-\d+\.jpg$/.test(f)).sort();
  const totalPages = files.length;
  console.log(`${totalPages} pages rendered. Starting column-split OCR (concurrency=${concurrency})...`);

  const pageTexts = await runInBatches(files, concurrency, (file, idx) => {
    const pageNum = idx + 1;
    const pageImgPath = path.join(tmpDir, file);
    return splitAndOcrPage(pageImgPath, pageNum, totalPages, tmpDir, splitRatio);
  });
  console.log("");

  const fullText = pageTexts.join("\n");

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, fullText, "utf-8");
  console.log(`Done. Wrote ${outputPath}`);

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

const inputPath = process.argv[2];
const outputPath = process.argv[3] ?? "RAW_OUTPUT_FROM_PDF/full_reasoning_v2.txt";
const splitRatio = process.argv[4] ? parseFloat(process.argv[4]) : DEFAULT_SPLIT_RATIO;
const concurrency = process.argv[5] ? parseInt(process.argv[5]) : DEFAULT_CONCURRENCY;

if (!inputPath) {
  console.error("Usage: tsx dumpPdfImageV2.ts input.pdf output.txt [splitRatio=0.495] [concurrency=4]");
  process.exit(1);
}

ocrDumpTextV2(inputPath, outputPath, splitRatio, concurrency).catch(console.error);