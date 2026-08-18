import { db, pool } from "./client.js";
import { products } from "./schema.js";

const seedProducts = [
  {
    name: "Camiseta Básica",
    description: "Camiseta de algodão premium com caimento regular.",
    priceCents: 7990,
    color: "from-sky-500/30 to-blue-600/30",
    stockQty: 20,
  },
  {
    name: "Tênis Urban",
    description: "Tênis urbano versátil para o dia a dia.",
    priceCents: 24990,
    color: "from-violet-500/30 to-purple-600/30",
    stockQty: 10,
  },
  {
    name: "Moletom Oversized",
    description: "Moletom oversized em fleece, conforto e estilo.",
    priceCents: 18990,
    color: "from-rose-500/30 to-pink-600/30",
    stockQty: 15,
  },
  {
    name: "Boné Clássico",
    description: "Boné clássico com aba curva e acabamento fosco.",
    priceCents: 5990,
    color: "from-amber-500/30 to-orange-600/30",
    stockQty: 30,
  },
  {
    name: "Mochila Compacta",
    description: "Mochila compacta impermeável com bolso para laptop.",
    priceCents: 13990,
    color: "from-emerald-500/30 to-teal-600/30",
    stockQty: 12,
  },
  {
    name: "Relógio Minimal",
    description: "Relógio minimalista com pulseira de aço inox.",
    priceCents: 32990,
    color: "from-zinc-500/30 to-zinc-600/30",
    stockQty: 8,
  },
];

async function main() {
  const existing = await db.select().from(products).limit(1);
  if (existing.length > 0) {
    console.log("produtos já presentes, seed ignorado");
    return;
  }

  const created = await db
    .insert(products)
    .values(seedProducts)
    .returning({ id: products.id, name: products.name });

  console.log(
    `seed aplicado: ${created.length} produtos (${created.map((p) => p.name).join(", ")})`,
  );
}

main()
  .catch((error) => {
    console.error("falha no seed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
