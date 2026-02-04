import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

interface CsvRow {
  RecordID: string;
  Name: string;
  Description: string;
  Category: string;
  'Part Number': string;
  'Product/Service/Bundle': string;
  Cost: string;
  Price: string;
  'Markup %': string;
  Status: string;
  'Charge Tax': string;
  Duration: string;
  'Created Date': string;
  'Last Modified Date': string;
}

function parsePriceToCents(priceStr: string): number {
  if (!priceStr || priceStr.trim() === '') return 0;
  const cleaned = priceStr.replace(/[^0-9.]/g, '');
  const price = parseFloat(cleaned);
  if (isNaN(price)) return 0;
  return Math.round(price * 100);
}

async function importProducts() {
  console.log('Starting product import...');
  
  const csvPath = 'data/poolbrain-complete-product-catalog.csv';
  const fileContent = readFileSync(csvPath, 'utf-8');
  
  const records: CsvRow[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  
  console.log(`Found ${records.length} records in CSV`);
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  
  const BATCH_SIZE = 100;
  
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const operations = [];
    
    for (const row of batch) {
      const recordId = row.RecordID?.trim();
      const name = row.Name?.trim();
      const partNumber = row['Part Number']?.trim();
      
      if (!name) {
        skipped++;
        continue;
      }
      
      const sku = partNumber || `REC-${recordId}`;
      const category = row.Category?.trim() || null;
      const unitPriceCents = parsePriceToCents(row.Price);
      const active = row.Status?.toLowerCase() === 'active';
      const sourceRecordId = recordId || null;
      
      operations.push(
        prisma.product.upsert({
          where: { sku },
          update: {
            name,
            category,
            unitPriceCents,
            active,
            sourceRecordId,
          },
          create: {
            sku,
            name,
            category,
            unitPriceCents,
            active,
            sourceRecordId,
          },
        })
      );
    }
    
    if (operations.length > 0) {
      const results = await prisma.$transaction(operations);
      created += results.length;
      console.log(`Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(records.length / BATCH_SIZE)}`);
    }
  }
  
  console.log('\nImport complete!');
  console.log(`  Upserted: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total processed: ${created + skipped}`);
  
  await prisma.$disconnect();
}

importProducts().catch((error) => {
  console.error('Import failed:', error);
  process.exit(1);
});
