// Next.js llama register() una vez al arrancar el servidor.
// Aquí se prende el vigía de muros (avisos al celular cuando cambian los muros).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { iniciarVigia } = await import("./lib/vigiaServidor");
    await iniciarVigia();
  }
}
