import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const SOURCE_DIR = path.resolve(__dirname, "..", "sap-o2c-data");
const EXPORT_DIR = path.resolve(__dirname, "csv-export");

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function convertFolder(folderName: string) {
  const folderPath = path.join(SOURCE_DIR, folderName);
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    return;
  }

  console.log(`Converting ${folderName}...`);
  const files = fs.readdirSync(folderPath).filter((f) => f.endsWith(".jsonl"));
  if (files.length === 0) return;

  const rows: any[] = [];
  const keys = new Set<string>();

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const stream = fs.createReadStream(filePath, "utf8");
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        rows.push(obj);
        Object.keys(obj).forEach((k) => keys.add(k));
      } catch (e) {
        console.error(`Error parsing line in ${file}:`, e);
      }
    }
  }

  if (rows.length === 0) return;

  const headerArray = Array.from(keys);
  const csvLines = [headerArray.join(",")];

  for (const row of rows) {
    const values = headerArray.map((k) => escapeCsv(row[k]));
    csvLines.push(values.join(","));
  }

  const exportPath = path.join(EXPORT_DIR, `${folderName}.csv`);
  fs.writeFileSync(exportPath, csvLines.join("\n"), "utf8");
  console.log(`Saved ${rows.length} rows to ${exportPath}`);
}

async function main() {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }

  const folders = fs.readdirSync(SOURCE_DIR);
  for (const folder of folders) {
    await convertFolder(folder);
  }

  console.log("\nConversion complete! Check the 'csv-export' directory.");
}

main().catch(console.error);
