import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('quotation brand tabs migration preserves old section ownership and line prices', async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      CREATE TABLE quotations (id text PRIMARY KEY, brand varchar(100) NOT NULL);
      CREATE TABLE quotation_sections (id text PRIMARY KEY, quotation_id text NOT NULL);
      CREATE TABLE quotation_items (id text PRIMARY KEY, section_id text NOT NULL, quoted_price numeric NOT NULL);
      INSERT INTO quotations VALUES ('quote', 'אלקטרה'), ('blank', '');
      INSERT INTO quotation_sections VALUES ('section', 'quote'), ('blank-section', 'blank');
      INSERT INTO quotation_items VALUES ('item', 'section', 123.45);
    `);
    const migration = await readFile(
      new URL(
        '../migrations/2026-11-09-quotation-brand-tabs.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await database.exec(migration);
    const quote = await database.query(
      'SELECT brands, warning_scope_version FROM quotations WHERE id = $1',
      ['quote'],
    );
    const section = await database.query(
      'SELECT brand FROM quotation_sections WHERE id = $1',
      ['section'],
    );
    const blank = await database.query(
      'SELECT brand FROM quotation_sections WHERE id = $1',
      ['blank-section'],
    );
    const price = await database.query(
      'SELECT quoted_price FROM quotation_items WHERE id = $1',
      ['item'],
    );
    assert.deepEqual(quote.rows[0].brands, ['אלקטרה']);
    assert.equal(quote.rows[0].warning_scope_version, 1);
    assert.equal(section.rows[0].brand, 'אלקטרה');
    assert.equal(blank.rows[0].brand, null);
    assert.equal(price.rows[0].quoted_price, '123.45');
  } finally {
    await database.close();
  }
});
