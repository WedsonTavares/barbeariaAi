import { redirect } from "next/navigation";

/** Índice de /admin: redireciona para o dashboard. */
export default function AdminIndex() {
  redirect("/admin/dashboard");
}
