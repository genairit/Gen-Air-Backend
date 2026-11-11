-- Reusable procurement materials and revisioned catalogue-item breakdowns.
-- The school workbook supplies material identities and project examples, not
-- universal pipe lengths or approved ordering quantities.
BEGIN;

CREATE TABLE materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(100) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  category varchar(100) NOT NULL,
  specification varchar(300),
  unit varchar(12) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'needs_spec',
  notes varchar(1000) NOT NULL DEFAULT '',
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT chk_material_unit CHECK (unit IN ('unit', 'set', 'm', 'sqm')),
  CONSTRAINT chk_material_status CHECK (status IN ('active', 'needs_spec', 'inactive')),
  CONSTRAINT chk_material_name CHECK (btrim(name) <> ''),
  CONSTRAINT chk_material_category CHECK (btrim(category) <> '')
);

CREATE TABLE catalogue_item_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogue_item_id uuid NOT NULL REFERENCES catalogue_items(id) ON DELETE RESTRICT,
  material_id uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  quantity_per_item numeric(14,4),
  basis varchar(24) NOT NULL,
  display_order integer NOT NULL,
  notes varchar(1000) NOT NULL DEFAULT '',
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT uq_catalogue_item_material UNIQUE (catalogue_item_id, material_id),
  CONSTRAINT uq_catalogue_item_material_order UNIQUE (catalogue_item_id, display_order),
  CONSTRAINT chk_catalogue_item_material_basis CHECK (basis IN ('fixed', 'conditional', 'included', 'project_measurement')),
  CONSTRAINT chk_catalogue_item_material_quantity CHECK (
    (basis = 'project_measurement' AND quantity_per_item IS NULL)
    OR (basis <> 'project_measurement' AND quantity_per_item IS NOT NULL
        AND quantity_per_item > 0 AND quantity_per_item < 'Infinity'::numeric)
  ),
  CONSTRAINT chk_catalogue_item_material_order CHECK (display_order >= 0)
);

CREATE TABLE catalogue_item_material_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogue_item_id uuid NOT NULL REFERENCES catalogue_items(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array'),
  created_by_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT uq_catalogue_item_material_revision UNIQUE (catalogue_item_id, revision)
);

CREATE OR REPLACE FUNCTION prevent_catalogue_material_revision_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'catalogue material revisions are immutable';
END;
$$;
CREATE TRIGGER trg_catalogue_material_revision_immutable
BEFORE UPDATE OR DELETE ON catalogue_item_material_revisions
FOR EACH ROW EXECUTE FUNCTION prevent_catalogue_material_revision_change();

CREATE INDEX idx_materials_search ON materials (status, category, code);
CREATE INDEX idx_catalogue_item_materials_material ON catalogue_item_materials (material_id);

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue_item_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue_item_material_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON materials, catalogue_item_materials, catalogue_item_material_revisions FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON materials, catalogue_item_materials, catalogue_item_material_revisions FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON materials, catalogue_item_materials, catalogue_item_material_revisions FROM authenticated;
  END IF;
END $$;

-- Internal codes distinguish material identities; they are not supplier SKUs.
-- needs_spec rows stay visibly unresolved until a buyer verifies grade/model.
INSERT INTO materials (code, name, category, specification, unit, status, notes) VALUES
  ('EQ-LG-ARUM220LTE5', 'מעבה VRF LG', 'ציוד', 'ARUM220LTE5', 'unit', 'active', 'דגם קיים בקטלוג; יחידה פיזית אחת לכל פריט קטלוג.'),
  ('EQ-LG-ARNU09GTRB4', 'מאייד קסטה קומפקטית LG', 'ציוד', 'ARNU09GTRB4 כולל פנל', 'unit', 'active', 'דגם קיים בקטלוג, כולל פנל.'),
  ('EQ-LG-ARNU15GTQB4', 'מאייד קסטה קומפקטית LG', 'ציוד', 'ARNU15GTQB4 כולל פנל', 'unit', 'active', 'דגם קיים בקטלוג, כולל פנל.'),
  ('EQ-LG-ARNU18GTQB4', 'מאייד קסטה קומפקטית LG', 'ציוד', 'ARNU18GTQB4 כולל פנל', 'unit', 'active', 'דגם קיים בקטלוג, כולל פנל.'),
  ('EQ-LG-ARNU24GTBB4', 'מאייד קסטה גדולה LG', 'ציוד', 'ARNU24GTBB4 כולל פנל', 'unit', 'active', 'דגם קיים בקטלוג, כולל פנל.'),
  ('EQ-LG-ARNU28GTBB4', 'מאייד קסטה גדולה LG', 'ציוד', 'ARNU28GTBB4 כולל פנל', 'unit', 'active', 'דגם קיים בקטלוג, כולל פנל.'),
  ('EQ-LG-ARNU36GTAB4', 'מאייד קסטה גדולה LG', 'ציוד', 'ARNU36GTAB4 כולל פנל', 'unit', 'active', 'דגם קיים בקטלוג, כולל פנל.'),
  ('EQ-LG-ARUM260LTE5', 'מעבה VRF LG', 'ציוד', 'ARUM260LTE5', 'unit', 'needs_spec', 'דגם בגיליון הדוגמה, אינו קיים בקטלוג הנוכחי; אין שיוך לפני אימות.'),
  ('EQ-LG-ARUM200LTE5', 'מעבה VRF LG', 'ציוד', 'ARUM200LTE5', 'unit', 'needs_spec', 'דגם בגיליון הדוגמה, אינו קיים בקטלוג הנוכחי; אין שיוך לפני אימות.'),
  ('EQ-LG-ARNU36GTNC4', 'מאייד קסטה LG', 'ציוד', 'ARNU36GTNC4', 'unit', 'needs_spec', 'דגם בגיליון הדוגמה, אינו קיים בקטלוג הנוכחי; פנל בנפרד רק אם אינו כלול.'),
  ('EQ-LG-ARNU28GTPC4', 'מאייד קסטה LG', 'ציוד', 'ARNU28GTPC4', 'unit', 'needs_spec', 'דגם בגיליון הדוגמה, אינו קיים בקטלוג הנוכחי; פנל בנפרד רק אם אינו כלול.'),
  ('EQ-LG-ARNU24GTPC4', 'מאייד קסטה LG', 'ציוד', 'ARNU24GTPC4', 'unit', 'needs_spec', 'דגם בגיליון הדוגמה, אינו קיים בקטלוג הנוכחי; פנל בנפרד רק אם אינו כלול.'),
  ('EQ-LG-ARNU18GTQD4', 'מאייד קסטה LG', 'ציוד', 'ARNU18GTQD4', 'unit', 'needs_spec', 'דגם בגיליון הדוגמה, אינו קיים בקטלוג הנוכחי; פנל בנפרד רק אם אינו כלול.'),
  ('EQ-LG-ARNU15GTQD4', 'מאייד קסטה LG', 'ציוד', 'ARNU15GTQD4', 'unit', 'needs_spec', 'דגם בגיליון הדוגמה, אינו קיים בקטלוג הנוכחי; פנל בנפרד רק אם אינו כלול.'),
  ('EQ-LG-ARNU09GTRD4', 'מאייד קסטה LG', 'ציוד', 'ARNU09GTRD4', 'unit', 'needs_spec', 'דגם בגיליון הדוגמה, אינו קיים בקטלוג הנוכחי; פנל בנפרד רק אם אינו כלול.'),
  ('MOUNT-OUTDOOR-SET', 'סט בולמי רעידות למעבה', 'אביזרי התקנה', 'לפי משקל המעבה ופרט ההתקנה', 'set', 'needs_spec', 'גיליון הרכש: 8 סטים ל-8 מעבים; סט אחד ליחידה, מספר הבולמים בסט לא נקבע.'),
  ('CONTROL-INDOOR-ONE', 'בקר או תרמוסטט למאייד', 'בקרה', 'דגם תואם לפי היצרן', 'unit', 'needs_spec', 'הנחת תכנון: בקר אחד למאייד בשליטה נפרדת; אין להזמין אם כלול או אם הבקרה משותפת.'),
  ('PANEL-CASSETTE-COMPACT', 'פאנל לקסטה קומפקטית', 'פאנלים', 'כ-62×62 ס״מ; מק״ט להתאמה', 'unit', 'needs_spec', 'בקטלוג LG הקסטות המקושרות כבר כוללות פנל; אין להזמין בנפרד.'),
  ('PANEL-CASSETTE-LARGE', 'פאנל לקסטה גדולה', 'פאנלים', 'כ-95×95 ס״מ; מק״ט להתאמה', 'unit', 'needs_spec', 'בקטלוג LG הקסטות המקושרות כבר כוללות פנל; אין להזמין בנפרד.'),
  ('VRF-BRANCH', 'הסתעפות או סעפת VRF', 'צנרת', 'לפי סכמת היצרן', 'unit', 'needs_spec', 'כמות ודגם נקבעים לפי סכמת מערכת מאושרת, לא ממספר המאיידים בלבד.'),
  ('CONTROL-CABLE', 'כבל תקשורת ובקרה', 'בקרה', 'סוג וחתך לפי היצרן', 'm', 'needs_spec', 'אורך לפי תוואי והגדרת גבול אחריות מול קבלן החשמל.'),
  ('AIR-GRILLE', 'גריל או פתח יניקה', 'פתחי אוויר', 'מידות וגמר לפי תכנון', 'unit', 'needs_spec', 'כמות, מידה וגמר דורשים ספירה ואישור תוכנית.'),
  ('FLEX-DUCT-6', 'שרשור אוויר קוטר 6 אינץ׳', 'תיעול', 'קוטר 6 אינץ׳; בידוד לפי מפרט', 'm', 'needs_spec', 'אורך לפי מדידה בפרויקט; אין ברירת מחדל ליחידת ציוד.'),
  ('FLEX-DUCT-8', 'שרשור אוויר קוטר 8 אינץ׳', 'תיעול', 'קוטר 8 אינץ׳; בידוד לפי מפרט', 'm', 'needs_spec', 'אורך לפי מדידה בפרויקט; אין ברירת מחדל ליחידת ציוד.'),
  ('DUCT-ROUND-4', 'תעלת פח עגולה לאוורור', 'תיעול', 'קוטר 4 אינץ׳', 'm', 'active', 'פריט קטלוג 100 נמכר במטר; מידה תואמת במדויק.'),
  ('DUCT-RIGID-30X10', 'תעלת אוויר קשיחה', 'תיעול', '30×10 ס״מ; חומר ועובי לאישור', 'm', 'needs_spec', 'אורך לפי מדידה בפרויקט.'),
  ('DUCT-RIGID-40X20', 'תעלת אוויר קשיחה', 'תיעול', '40×20 ס״מ; חומר ועובי לאישור', 'm', 'needs_spec', 'אורך לפי מדידה בפרויקט.'),
  ('DUCT-RIGID-115X25', 'תעלת אוויר קשיחה', 'תיעול', '115×25 ס״מ; חומר ועובי לאישור', 'm', 'needs_spec', 'אורך לפי מדידה בפרויקט.'),
  ('DUCT-RIGID-135X30', 'תעלת אוויר קשיחה', 'תיעול', '135×30 ס״מ; חומר ועובי לאישור', 'm', 'needs_spec', 'אורך לפי מדידה בפרויקט.'),
  ('ROOF-COVER', 'תעלת פח מגולוון לכיסוי צנרת גג', 'תיעול', 'מידות חתך לפי תכנון', 'm', 'needs_spec', '15.4 מ׳ בגיליון הם מדידת פרויקט בלבד.'),
  ('FAN-ROOF-4880', 'מפוח גג', 'מפוחים', 'ספיקה 4,880 מ״ק/שעה; לחץ ודגם לאישור', 'unit', 'needs_spec', 'כמות הפרויקט בגיליון: 1; אין דגם רכש מאושר.'),
  ('FAN-ROOF-3440', 'מפוח גג', 'מפוחים', 'ספיקה 3,440 מ״ק/שעה; לחץ ודגם לאישור', 'unit', 'needs_spec', 'כמות הפרויקט בגיליון: 1; אין דגם רכש מאושר.'),
  ('FAN-LINE-450', 'מפוח קווי', 'מפוחים', 'ספיקה 450 מ״ק/שעה; לחץ ודגם לאישור', 'unit', 'needs_spec', 'כמות הפרויקט בגיליון: 3; אין דגם רכש מאושר.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO materials (code, name, category, specification, unit, status, notes)
SELECT 'COPPER-' || diameter.code, 'צינור נחושת למיזוג', 'צנרת נחושת', diameter.label, 'm', 'needs_spec',
       'קוטר מתוך גיליון הרכש; עובי דופן/תקן ודרגת לחץ לאישור. האורך נקבע במדידת פרויקט.'
FROM (VALUES
  ('1-4', 'קוטר 1/4 אינץ׳'), ('3-8', 'קוטר 3/8 אינץ׳'),
  ('1-2', 'קוטר 1/2 אינץ׳'), ('5-8', 'קוטר 5/8 אינץ׳'),
  ('3-4', 'קוטר 3/4 אינץ׳'), ('7-8', 'קוטר 7/8 אינץ׳'),
  ('1-1-8', 'קוטר 1-1/8 אינץ׳'), ('1-3-8', 'קוטר 1-3/8 אינץ׳')
) AS diameter(code, label)
ON CONFLICT (code) DO NOTHING;

INSERT INTO materials (code, name, category, specification, unit, status, notes)
SELECT 'INSULATION-' || diameter.code, 'בידוד לצנרת מיזוג', 'בידוד', diameter.label, 'm', 'needs_spec',
       'קוטר מתוך גיליון הרכש; עובי וסוג בידוד לאישור. האורך נקבע במדידת פרויקט.'
FROM (VALUES
  ('1-4', 'קוטר 1/4 אינץ׳'), ('3-8', 'קוטר 3/8 אינץ׳'),
  ('1-2', 'קוטר 1/2 אינץ׳'), ('5-8', 'קוטר 5/8 אינץ׳'),
  ('3-4', 'קוטר 3/4 אינץ׳'), ('7-8', 'קוטר 7/8 אינץ׳'),
  ('1-1-8', 'קוטר 1-1/8 אינץ׳'), ('1-3-8', 'קוטר 1-3/8 אינץ׳')
) AS diameter(code, label)
ON CONFLICT (code) DO NOTHING;

-- Exact catalogue models are retained as procurement equipment identities.
INSERT INTO catalogue_item_materials (catalogue_item_id, material_id, quantity_per_item, basis, display_order, notes)
SELECT item.id, material.id, 1, 'fixed', 0, 'יחידת ציוד אחת לכל יחידת פריט קטלוג.'
FROM catalogue_items item JOIN materials material ON material.code = 'EQ-LG-' || item.sku
WHERE item.sku IN ('ARUM220LTE5', 'ARNU09GTRB4', 'ARNU15GTQB4', 'ARNU18GTQB4',
                   'ARNU24GTBB4', 'ARNU28GTBB4', 'ARNU36GTAB4')
  AND item.brand = 'LG' AND item.status = 'active' AND item.deleted_at IS NULL
ON CONFLICT (catalogue_item_id, material_id) DO NOTHING;

-- The school example has one mount set per outdoor and assumes one controller
-- per separately controlled indoor. Both stay conditional, never auto-ordered.
INSERT INTO catalogue_item_materials (catalogue_item_id, material_id, quantity_per_item, basis, display_order, notes)
SELECT item.id, material.id, 1, 'conditional', 1,
       CASE WHEN item.equipment_role = 'outdoor' THEN 'לאשר סט לפי משקל ופרט התקנה.'
            ELSE 'רק בשליטה נפרדת וכאשר בקר אינו כלול בציוד.' END
FROM catalogue_items item
JOIN materials material ON material.code = CASE WHEN item.equipment_role = 'outdoor'
  THEN 'MOUNT-OUTDOOR-SET' ELSE 'CONTROL-INDOOR-ONE' END
WHERE item.sku IN ('ARUM220LTE5', 'ARNU09GTRB4', 'ARNU15GTQB4', 'ARNU18GTQB4',
                   'ARNU24GTBB4', 'ARNU28GTBB4', 'ARNU36GTAB4')
  AND item.brand = 'LG' AND item.status = 'active' AND item.deleted_at IS NULL
ON CONFLICT (catalogue_item_id, material_id) DO NOTHING;

-- Existing LG catalogue wording explicitly says these cassettes include a panel.
INSERT INTO catalogue_item_materials (catalogue_item_id, material_id, quantity_per_item, basis, display_order, notes)
SELECT item.id, material.id, 1, 'included', 2, 'כלול בפריט הקטלוג; אין להוסיף שורת רכש נפרדת.'
FROM catalogue_items item
JOIN materials material ON material.code = CASE WHEN item.sku IN ('ARNU09GTRB4', 'ARNU15GTQB4', 'ARNU18GTQB4')
  THEN 'PANEL-CASSETTE-COMPACT' ELSE 'PANEL-CASSETTE-LARGE' END
WHERE item.sku IN ('ARNU09GTRB4', 'ARNU15GTQB4', 'ARNU18GTQB4',
                   'ARNU24GTBB4', 'ARNU28GTBB4', 'ARNU36GTAB4')
  AND item.brand = 'LG' AND item.status = 'active' AND item.deleted_at IS NULL
ON CONFLICT (catalogue_item_id, material_id) DO NOTHING;

-- Catalogue item 100 is explicitly sold per metre: one metre of that item
-- means one measured metre of the matching 4-inch round duct.
INSERT INTO catalogue_item_materials (catalogue_item_id, material_id, quantity_per_item, basis, display_order, notes)
SELECT item.id, material.id, 1, 'fixed', 0, 'יחידות תואמות: מטר קטלוג למטר חומר.'
FROM catalogue_items item JOIN materials material ON material.code = 'DUCT-ROUND-4'
WHERE item.sku = '100' AND item.description = 'תעלת פח עגול 4" לאוורור שרותים'
  AND item.unit = 'מטר' AND item.status = 'active' AND item.deleted_at IS NULL
ON CONFLICT (catalogue_item_id, material_id) DO NOTHING;

INSERT INTO catalogue_item_material_revisions (catalogue_item_id, revision, lines)
SELECT item.id, 1, jsonb_agg(jsonb_build_object(
  'materialId', material.id, 'code', material.code, 'name', material.name,
  'category', material.category, 'specification', material.specification,
  'unit', material.unit, 'status', material.status,
  'quantityPerItem', link.quantity_per_item, 'basis', link.basis,
  'displayOrder', link.display_order, 'notes', link.notes
) ORDER BY link.display_order)
FROM catalogue_items item
JOIN catalogue_item_materials link ON link.catalogue_item_id = item.id
JOIN materials material ON material.id = link.material_id
GROUP BY item.id
ON CONFLICT (catalogue_item_id, revision) DO NOTHING;

COMMIT;
