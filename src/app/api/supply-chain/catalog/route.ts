import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

// Returns products from Hafeez's Product List (single catalog) so the Supply
// Chain master can reference them. Products can ONLY be born in the Product
// List — Foods & Spices (pl_products), Rice (rice_products), and any future
// division. The Supply Chain master picks from here, then carton specs are
// filled in manually.

type CatalogItem = {
  sourceProductId: string;
  name: string;
  category: string;
  brandId: string;
  packagingDesc: string;  // carried over to the SC master's Packing Description
  division: string;       // foods_spices | rice | general | sports
  divisionLabel: string;
};

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [foods, rice] = await Promise.all([
      supabase.from("pl_products").select("id, name, category, brand_id, packaging_desc, active"),
      supabase.from("rice_products").select("id, name, category, brand_id, packaging_desc, active"),
    ]);

    if (foods.error) throw foods.error;
    if (rice.error) throw rice.error;

    const items: CatalogItem[] = [];

    for (const p of foods.data ?? []) {
      if (p.active === false) continue;
      items.push({
        sourceProductId: p.id as string,
        name: (p.name as string) ?? "",
        category: (p.category as string) ?? "",
        brandId: (p.brand_id as string) ?? "",
        packagingDesc: (p.packaging_desc as string) ?? "",
        division: "foods_spices",
        divisionLabel: "Foods & Spices",
      });
    }

    for (const p of rice.data ?? []) {
      if (p.active === false) continue;
      items.push({
        sourceProductId: p.id as string,
        name: (p.name as string) ?? "",
        category: (p.category as string) ?? "",
        brandId: (p.brand_id as string) ?? "",
        packagingDesc: (p.packaging_desc as string) ?? "",
        division: "rice",
        divisionLabel: "Rice",
      });
    }

    return Response.json({ catalog: items });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
