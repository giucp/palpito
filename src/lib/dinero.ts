// Cómo se escribe la plata en Pálpito: siempre dos decimales y en mono
// (palpito_guia.md §7).
//
// Vivía en `lib/cupon.ts`, que era el cálculo del cupón contra la casa. Cuando
// eso se retiró, media app seguía importando el formato desde ahí; se mudó acá,
// que es donde se lo busca.
export const fmt = (n: number) => "$" + n.toFixed(2);
