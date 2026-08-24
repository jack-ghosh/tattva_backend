import "dotenv/config";
import { PDFParse } from "pdf-parse";
import path from "path";
import fs from "fs";

async function dumpRawText(pdfPath: string) {
  const parser = new PDFParse({ url: `file:///${path.resolve(pdfPath)}` });
  const result = await parser.getText();
  fs.writeFileSync("RAW_OUTPUT_FROM_PDF/full_yct_rrb_gk.txt", result.text);
  console.log("Done. Check raw_output_rrb_yct_gk");
}

dumpRawText(process.argv[2]);

