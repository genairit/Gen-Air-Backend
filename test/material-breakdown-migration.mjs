import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(
  new URL('../migrations/2026-11-11-catalogue-material-breakdowns.sql', import.meta.url),
  'utf8',
);

test('material seed keeps measured lengths unknown and snapshots fixed and conditional parts', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE users (id uuid PRIMARY KEY);
    CREATE TABLE catalogue_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sku text NOT NULL,
      description text NOT NULL,
      unit text NOT NULL,
      brand text NOT NULL,
      status text NOT NULL,
      equipment_role text NOT NULL,
      deleted_at timestamptz
    );
    INSERT INTO catalogue_items (sku, description, unit, brand, status, equipment_role) VALUES
      ('ARUM220LTE5', 'מעבה VRF LG', 'יח', 'LG', 'active', 'outdoor'),
      ('ARNU09GTRB4', 'קסטה קטנה (כולל פנל)', 'יח', 'LG', 'active', 'indoor'),
      ('ARNU15GTQB4', 'קסטה קטנה (כולל פנל)', 'יח', 'LG', 'active', 'indoor'),
      ('ARNU18GTQB4', 'קסטה קטנה (כולל פנל)', 'יח', 'LG', 'active', 'indoor'),
      ('ARNU24GTBB4', 'קסטה גדולה (כולל פנל)', 'יח', 'LG', 'active', 'indoor'),
      ('ARNU28GTBB4', 'קסטה גדולה (כולל פנל)', 'יח', 'LG', 'active', 'indoor'),
      ('ARNU36GTAB4', 'קסטה גדולה (כולל פנל)', 'יח', 'LG', 'active', 'indoor'),
      ('100', 'תעלת פח עגול 4" לאוורור שרותים', 'מטר', '', 'active', 'other');
  `);
  await db.exec(migration);

  const counts = await db.query(`
    SELECT (SELECT count(*)::int FROM materials) AS materials,
           (SELECT count(*)::int FROM catalogue_item_materials) AS links,
           (SELECT count(*)::int FROM catalogue_item_material_revisions) AS revisions
  `);
  assert.deepEqual(counts.rows[0], { materials: 49, links: 21, revisions: 8 });

  const pipe = await db.query(`
    SELECT count(*)::int AS links FROM catalogue_item_materials link
    JOIN materials material ON material.id = link.material_id
    WHERE material.code LIKE 'COPPER-%' OR material.code LIKE 'INSULATION-%'
  `);
  assert.equal(pipe.rows[0].links, 0);

  const outdoor = await db.query(`
    SELECT material.code, link.quantity_per_item, link.basis
    FROM catalogue_item_materials link
    JOIN materials material ON material.id = link.material_id
    JOIN catalogue_items item ON item.id = link.catalogue_item_id
    WHERE item.sku = 'ARUM220LTE5' ORDER BY link.display_order
  `);
  assert.deepEqual(
    outdoor.rows.map(row => [row.code, row.quantity_per_item, row.basis]),
    [
      ['EQ-LG-ARUM220LTE5', '1.0000', 'fixed'],
      ['MOUNT-OUTDOOR-SET', '1.0000', 'conditional'],
    ],
  );

  const panels = await db.query(`
    SELECT count(*)::int AS included FROM catalogue_item_materials link
    JOIN materials material ON material.id = link.material_id
    WHERE material.code LIKE 'PANEL-%' AND link.basis = 'included'
  `);
  assert.equal(panels.rows[0].included, 6);

  await assert.rejects(
    db.exec(`UPDATE catalogue_item_material_revisions SET revision = 2 WHERE revision = 1`),
    /immutable/,
  );
  await assert.rejects(
    db.exec(`INSERT INTO catalogue_item_materials
      (catalogue_item_id, material_id, basis, display_order)
      SELECT item.id, material.id, 'fixed', 9
      FROM catalogue_items item, materials material
      WHERE item.sku = '100' AND material.code = 'COPPER-1-4'`),
    /chk_catalogue_item_material_quantity/,
  );
  await db.close();
});
