import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Los scripts sueltos de `scripts/` son de Node, no del bundle: se corren a
    // mano con `node scripts/loquesea.js` y usan `require`. Medirlos con las
    // reglas de Next llenaba el lint de 15 errores que no se pueden arreglar sin
    // romperlos, y ese ruido tapaba los avisos de verdad de `src/`.
    //
    // Los `.ts` de `scripts/` NO están acá a propósito: esos importan código
    // real de `src/` y conviene que se revisen igual.
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
