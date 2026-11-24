export type ToastKind = "success" | "error" | "info";
export type ToastMsg = { id: number; kind: ToastKind; text: string };
type L = (t: ToastMsg) => void;
const ls = new Set<L>();
let n = 0;
export const onToast = (l: L) => { ls.add(l); return () => void ls.delete(l); };
export const toast = (text: string, kind: ToastKind = "success") => ls.forEach((l) => l({ id: ++n, kind, text }));
