// scripts/spotCheckColumnSplit.ts
// Usage: tsx scripts/spotCheckColumnSplit.ts full_reasoning.pdf [splitRatio=0.495]
//
// Renders a handful of pages spread across every section of the book (using the
// known TOC page ranges), draws the proposed column-split line on each as a red
// vertical line, and saves them to spot_check_output/ for visual inspection.
//
// Run this BEFORE committing to the full 929-page OCR pass — if the red line
// cuts through text on any sampled page, adjust splitRatio (or note that page
// range needs a different ratio) and re-run this cheap check instead of
// discovering the problem after a 90+ minute full run.

import "dotenv/config";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import sharp from "sharp";

// Page ranges from the book's Table of Contents — one or two sample pages
// pulled from each section, biased toward pages likely to have different
// layouts (early/mid/late in each section, and explicitly figure-heavy sections).
const SAMPLE_PAGES: { label: string; page: number }[] = [
  { label: "Analogy (text-heavy, early)",          page: 10 },
  { label: "Analogy Type-3 (arrow diagrams)",       page: 23 },
  { label: "Coding-Decoding (text-heavy)",          page: 70 },
  { label: "Classification Type-4 (figures)",       page: 145 },
  { label: "Series Type-1 (numbers)",               page: 175 },
  { label: "Series Type-4 (figures)",               page: 220 },
  { label: "Missing Figure Type-3",                 page: 255 },
  { label: "Direction Test (mixed diagrams)",       page: 290 },
  { label: "Blood Relation (text-heavy)",           page: 330 },
  { label: "Venn Diagram (figure-heavy)",           page: 420 },
  { label: "Problems based on Diagram",             page: 445 },
  { label: "Analytical Reasoning",                  page: 480 },
  { label: "Syllogism (text-heavy)",                page: 550 },
  { label: "Statement and Conclusion",              page: 630 },
  { label: "Data Sufficiency",                      page: 710 },
  { label: "Sequence/Sitting Arrangement (mixed)",  page: 760 },
  { label: "Calendar/Clock",                        page: 810 },
  { label: "Formation and Division of figure",      page: 835 },
  { label: "Lines and Figures Counting",            page: 860 },
  { label: "Water and Mirror Image",                page: 885 },
  { label: "Cube/Cuboid/Dice (figure-heavy)",       page: 894 },
  { label: "Miscellaneous (late, check tail)",      page: 920 },
];

async function spotCheck(pdfPath: string, splitRatio: number) {
  const tmpDir = path.join(os.tmpdir(), `spotcheck_${Date.now()}`);
  const outDir = path.join(process.cwd(), "spot_check_output");
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  // Confirm PDF page count so we don't request pages beyond the actual file.
  const infoOut = execSync(`pdfinfo "${pdfPath}"`).toString();
  const pagesMatch = infoOut.match(/Pages:\s+(\d+)/);
  const totalPages = pagesMatch ? parseInt(pagesMatch[1]) : 0;
  console.log(`PDF has ${totalPages} pages.\n`);

  const validSamples = SAMPLE_PAGES.filter(s => s.page <= totalPages);
  if (validSamples.length < SAMPLE_PAGES.length) {
    console.log(`Note: ${SAMPLE_PAGES.length - validSamples.length} sample page(s) exceed this PDF's page count and will be skipped.\n`);
  }

  for (const { label, page } of validSamples) {
    const rawPath = path.join(tmpDir, `raw-${page}`);
    execSync(`pdftoppm -jpeg -r 200 -f ${page} -l ${page} "${pdfPath}" "${rawPath}"`);

    const renderedFile = fs.readdirSync(tmpDir).find(f => f.startsWith(`raw-${page}`) && f.endsWith(".jpg"));
    if (!renderedFile) {
      console.log(`⚠️  Page ${page} (${label}) — render failed, skipping`);
      continue;
    }

    const imgPath = path.join(tmpDir, renderedFile);
    const meta = await sharp(imgPath).metadata();
    const w = meta.width!;
    const h = meta.height!;
    const mid = Math.round(w * splitRatio);

    // Draw a 3px red vertical line at the proposed split point, overlaid on the original.
    const lineSvg = Buffer.from(
      `<svg width="${w}" height="${h}"><rect x="${mid - 1}" y="0" width="3" height="${h}" fill="red" opacity="0.8"/></svg>`
    );

    const outPath = path.join(outDir, `p${String(page).padStart(3, "0")}_${label.replace(/[^\w]+/g, "_")}.jpg`);
    await sharp(imgPath)
      .composite([{ input: lineSvg, top: 0, left: 0 }])
      .toFile(outPath);

    console.log(`✅ Page ${page} (${label}) → ${outPath}`);
  }

  console.log(`\nDone. Open the images in spot_check_output/ and check whether the red line`);
  console.log(`cuts cleanly through the white gutter between columns, or slices through text.`);
  console.log(`If it slices text on any page, note which page/section and we'll either adjust`);
  console.log(`splitRatio globally or add a per-section override.`);

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

const pdfPath = process.argv[2];
const splitRatio = process.argv[3] ? parseFloat(process.argv[3]) : 0.495;

if (!pdfPath) {
  console.error("Usage: tsx spotCheckColumnSplit.ts full_reasoning.pdf [splitRatio=0.495]");
  process.exit(1);
}

spotCheck(pdfPath, splitRatio).catch(console.error);