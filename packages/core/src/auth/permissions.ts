import type { Tenant } from "@prisma/client";

/** Claims resolvidas no servidor (no web vêm do Clerk auth()). */
export interface AuthContext {
  userId: string | null;
  orgId: string | null; // Clerk active organization id
  orgRole: string | null; // ex.: "org:admin"
  isSuperAdmin?: boolean;
}

export type AppRole = "OWNER" | "ADMIN" | "STAFF";

const ROLE_MAP: Record<string, AppRole> = {
  "org:owner": "OWNER",
  "org:admin": "ADMIN",
  "org:staff": "STAFF",
  // Roles padrão do Clerk (instância de produção pode não ter os customizados acima):
  "org:member": "STAFF",
  admin: "ADMIN",
  basic_member: "STAFF",
};

export class AccessError extends Error {
  constructor(message = "Acesso negado") {
    super(message);
    this.name = "AccessError";
  }
}

/** Garante que o usuário logado pertence à organização do tenant. */
export function requireTenantAccess(
  tenant: Tenant | null,
  auth: AuthContext
): asserts tenant is Tenant {
  if (!tenant) throw new AccessError("Empresa não encontrada");
  if (!auth.userId) throw new AccessError("Não autenticado");
  if (auth.isSuperAdmin) return;
  if (!auth.orgId || auth.orgId !== tenant.clerkOrgId) {
    throw new AccessError("Você não tem acesso a esta empresa");
  }
}

export function currentRole(auth: AuthContext): AppRole | null {
  if (auth.isSuperAdmin) return "OWNER";
  return auth.orgRole ? ROLE_MAP[auth.orgRole] ?? null : null;
}

export function requireRole(auth: AuthContext, allowed: AppRole[]) {
  if (auth.isSuperAdmin) return;
  const role = currentRole(auth);
  if (!role || !allowed.includes(role)) {
    throw new AccessError("Permissão insuficiente");
  }
}

export function requireSuperAdmin(auth: AuthContext) {
  if (!auth.isSuperAdmin) throw new AccessError("Apenas super admin");
}
