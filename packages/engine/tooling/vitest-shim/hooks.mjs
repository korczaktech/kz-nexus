export async function resolve(specifier, context, next) {
  if (specifier === "vitest") return { url: new URL("./index.js", import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
