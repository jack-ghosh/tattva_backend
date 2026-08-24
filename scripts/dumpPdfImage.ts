import "dotenv/config";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

async function ocrDumpText(pdfPath: string) {
  const tmpDir = path.join(os.tmpdir(), "ocr_pages");
  fs.mkdirSync(tmpDir, { recursive: true });

  // rasterize every page at 200 DPI
  execSync(`pdftoppm -jpeg -r 200 "${pdfPath}" "${tmpDir}/page"`);

  const files = fs.readdirSync(tmpDir).filter(f => f.endsWith(".jpg")).sort();

  let fullText = "";
  for (const file of files) {
    const imgPath = path.join(tmpDir, file);
    const outBase = path.join(tmpDir, file.replace(".jpg", ""));
    execSync(`tesseract "${imgPath}" "${outBase}" --psm 1`);
    fullText += fs.readFileSync(`${outBase}.txt`, "utf-8") + "\n\n";
    console.log(`OCR'd ${file}`);
  }

  fs.writeFileSync("RAW_OUTPUT_FROM_PDF/full_reasoning.txt", fullText);
  console.log("Done.");
}

ocrDumpText(process.argv[2]);