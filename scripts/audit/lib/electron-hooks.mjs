const stubUrl = new URL("./electron-stub.mjs", import.meta.url).href;
export async function resolve(specifier, context, next) {
  if (specifier === "electron") return { url: stubUrl, shortCircuit: true };
  return next(specifier, context);
}
