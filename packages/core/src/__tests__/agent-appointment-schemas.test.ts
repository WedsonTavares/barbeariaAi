import { describe, expect, it } from "vitest";

import {
  agentAppointmentCancelInput,
  agentAppointmentInput,
  agentAppointmentRescheduleInput,
  agentAvailabilityInput,
} from "../schemas";

describe("schemas do agente de serviços", () => {
  it("aceita consulta de disponibilidade por início/fim", () => {
    const parsed = agentAvailabilityInput.parse({
      date: "2032-02-10",
      startTime: "14:00",
      endTime: "15:00",
      serviceName: "Corte",
      professionalName: "João",
    });
    expect(parsed.startTime).toBe("14:00");
    expect(parsed.endTime).toBe("15:00");
  });

  it("rejeita fim antes do início", () => {
    expect(
      agentAvailabilityInput.safeParse({
        date: "2032-02-10",
        startTime: "15:00",
        endTime: "14:00",
      }).success
    ).toBe(false);
  });

  it("valida criação de agendamento por serviços", () => {
    const parsed = agentAppointmentInput.parse({
      phone: "+55 (16) 99999-1234",
      name: "Maria",
      date: "2032-02-10",
      startTime: "14:00",
      serviceNames: ["Corte", "Barba"],
    });
    expect(parsed.phone).toBe("5516999991234");
    expect(parsed.serviceNames).toEqual(["Corte", "Barba"]);
  });

  it("valida reagendamento e cancelamento por appointmentId", () => {
    const appointmentId = "b4c8db19-45db-4e11-bcf4-c372f2b4cb15";
    expect(
      agentAppointmentRescheduleInput.parse({
        appointmentId,
        phone: "5516999991234",
        date: "2032-02-11",
        startTime: "15:30",
      }).appointmentId
    ).toBe(appointmentId);
    expect(
      agentAppointmentCancelInput.safeParse({
        appointmentId,
        phone: "5516999991234",
        confirmed: true,
      }).success
    ).toBe(true);
  });
});
