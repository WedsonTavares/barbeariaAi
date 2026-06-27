import { z } from "zod";

export const toyCategory = z.enum([
  "CAMA_ELASTICA", "PISCINA_BOLINHAS", "INFLAVEL", "ESCORREGADOR", "MESA_CADEIRA", "OUTRO",
]);

export const leadSource = z.enum([
  "INSTAGRAM", "FACEBOOK", "GOOGLE", "INDICATION", "WHATSAPP", "WEBSITE", "PAID_ADS", "PARTNER", "OTHER",
]);

export const toyInput = z.object({
  name: z.string().min(2, "Informe o nome"),
  category: toyCategory,
  description: z.string().optional(),
  purchasePrice: z.coerce.number().nonnegative(),
  defaultRentPrice: z.coerce.number().nonnegative(),
});
export type ToyInput = z.infer<typeof toyInput>;

export const customerInput = z.object({
  name: z.string().min(2),
  phone: z.string().min(8),
  email: z.string().email().optional().or(z.literal("")),
  neighborhood: z.string().optional(),
  address: z.string().optional(),
  imageConsent: z.coerce.boolean().optional(),
});
export type CustomerInput = z.infer<typeof customerInput>;

export const bookingInput = z
  .object({
    customerId: z.string().uuid(),
    eventDate: z.coerce.date(),
    setupTime: z.coerce.date(),
    pickupTime: z.coerce.date(),
    address: z.string().optional(),
    neighborhood: z.string().optional(),
    total: z.coerce.number().nonnegative(),
    depositAmount: z.coerce.number().nonnegative().default(0),
    toyIds: z.array(z.string().uuid()).min(1, "Selecione ao menos um brinquedo"),
    leadSource: leadSource.optional(),
    notes: z.string().optional(),
  })
  .refine((d) => d.pickupTime > d.setupTime, {
    message: "A retirada deve ser depois da montagem",
    path: ["pickupTime"],
  });
export type BookingInput = z.infer<typeof bookingInput>;

export const leadInput = z.object({
  name: z.string().min(2),
  phone: z.string().min(8),
  source: leadSource.default("WEBSITE"),
  message: z.string().optional(),
  desiredDate: z.coerce.date().optional(),
  neighborhood: z.string().optional(),
  childrenCount: z.coerce.number().int().optional(),
  ageRange: z.string().optional(),
  desiredToy: z.string().optional(),
});
export type LeadInput = z.infer<typeof leadInput>;
