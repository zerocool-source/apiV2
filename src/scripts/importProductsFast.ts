import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function toCents(v: string): number {
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

async function main() {
  const csvPath = path.join(process.cwd(), "data", "poolbrain-complete-product-catalog.csv");
  if (!fs.existsSync(csvPath)) throw new Error(`CSV not found: ${csvPath}`);

  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const headers = parseCsvLine(lines[0]);
  const colIndex = (name: string) => headers.findIndex((h) => h === name);

  const iRecordID = colIndex("RecordID");
  const iName = colIndex("Name");
  const iCategory = colIndex("Category");
  const iPartNumber = colIndex("Part Number");
  const iPrice = colIndex("Price");
  const iStatus = colIndex("Status");

  for (const [col, idx] of [
    ["RecordID", iRecordID],
    ["Name", iName],
    ["Category", iCategory],
    ["Part Number", iPartNumber],
    ["Price", iPrice],
    ["Status", iStatus],
  ] as const) {
    if (idx < 0) throw new Error(`Missing CSV column: ${col}`);
  }

  const rows: Array<{
    sku: string;
    name: string;
    category: string | null;
    unitPriceCents: number;
    active: boolean;
    sourceRecordId: string | null;
  }> = [];

  for (let i = 1; i < lines.length; i++) {
    const r = parseCsvLine(lines[i]);
    if (r.length < headers.length) continue;

    const recordId = r[iRecordID] || "";
    const name = r[iName] || "";
    const category = r[iCategory] || null;
    const partNumber = r[iPartNumber] || "";
    const priceCents = toCents(r[iPrice] || "");
    const status = (r[iStatus] || "").toLowerCase();
    const active = status === "active";

    if (!name) continue;

    const sku = partNumber ? partNumber : `PB-${recordId}`;
    if (!sku || sku === "PB-") continue;

    rows.push({
      sku,
      name,
      category,
      unitPriceCents: priceCents,
      active,
      sourceRecordId: recordId || null,
    });
  }

  console.log(`Prepared ${rows.length} product rows.`);

  const BATCH = 1000;
  let inserted = 0;
  const totalBatches = Math.ceil(rows.length / BATCH);

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);

    const res = await prisma.product.createMany({
      data: chunk,
      skipDuplicates: true,
    });

    inserted += res.count;
    console.log(`Batch ${Math.floor(i / BATCH) + 1}/${totalBatches}: inserted ${res.count}. Total inserted ${inserted}.`);
  }

  console.log(`DONE. Inserted ${inserted} new products (duplicates skipped).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
