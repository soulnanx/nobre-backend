import * as repo from "./shipping.repo.js";

export async function quote(
  cep: string,
  subtotalCents: number,
): Promise<number> {
  const rulePrice = await repo.findRuleByCep(cep);
  if (rulePrice !== null) return rulePrice;
  if (subtotalCents >= 20000) return 0;
  return 2500;
}
