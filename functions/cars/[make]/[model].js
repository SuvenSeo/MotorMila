import { serveCarsShell } from "../../_lib/carsShell.js";

export function onRequest(context) {
  const { make, model } = context.params || {};
  return serveCarsShell(context, [String(make || ""), String(model || "")]);
}
