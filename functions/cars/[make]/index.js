import { serveCarsShell } from "../../_lib/carsShell.js";

export function onRequest(context) {
  return serveCarsShell(context, [String(context.params?.make || "")]);
}
