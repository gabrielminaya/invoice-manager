import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  daysInMonth,
  diffInDays,
  formatDateDO,
  formatMonthYear,
  isISODate,
  relativeDayLabel,
  todayInTimeZone,
} from "@/lib/dates";

describe("addMonths", () => {
  it("conserva el día cuando existe en el mes destino", () => {
    expect(addMonths("2026-01-15", 1)).toBe("2026-02-15");
    expect(addMonths("2026-08-23", 1)).toBe("2026-09-23");
  });

  it("recorta al último día cuando el día no existe", () => {
    // Enero tiene 31; febrero de 2026 solo 28.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
  });

  it("respeta los años bisiestos", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it("con anchorDay recupera el día pactado tras un mes corto", () => {
    // Este es el motivo de existir de anchorDay: sin él, una suscripción
    // anclada al 31 se iría arrastrando hacia atrás mes a mes.
    const febrero = addMonths("2026-01-31", 1, 31);
    expect(febrero).toBe("2026-02-28");
    expect(addMonths(febrero, 1, 31)).toBe("2026-03-31");
  });

  it("cruza el fin de año", () => {
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-06-30", 12)).toBe("2027-06-30");
  });
});

describe("addDays", () => {
  it("cruza meses y años", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("suma los días de crédito de una factura", () => {
    expect(addDays("2026-09-01", 30)).toBe("2026-10-01");
    expect(addDays("2026-08-23", 0)).toBe("2026-08-23");
  });
});

describe("diffInDays", () => {
  it("cuenta días de calendario en ambos sentidos", () => {
    expect(diffInDays("2026-08-23", "2026-08-25")).toBe(2);
    expect(diffInDays("2026-08-25", "2026-08-23")).toBe(-2);
    expect(diffInDays("2026-08-25", "2026-08-25")).toBe(0);
  });

  it("no se descuadra al cruzar un cambio de horario", () => {
    // En marzo y noviembre hay husos que cambian; al trabajar en UTC sobre
    // fechas civiles, la diferencia sigue siendo de días enteros.
    expect(diffInDays("2026-03-01", "2026-04-01")).toBe(31);
    expect(diffInDays("2026-11-01", "2026-11-30")).toBe(29);
  });
});

describe("formato y validación", () => {
  it("valida cadenas ISO", () => {
    expect(isISODate("2026-08-25")).toBe(true);
    expect(isISODate("25-08-2026")).toBe(false);
    expect(isISODate("2026-8-5")).toBe(false);
    expect(isISODate(undefined)).toBe(false);
  });

  it("imprime la fecha en el formato de la factura", () => {
    expect(formatDateDO("2026-07-23")).toBe("23-07-2026");
    expect(formatDateDO(null)).toBe("—");
  });

  it("nombra el mes en español", () => {
    expect(formatMonthYear("2026-08-01")).toBe("agosto 2026");
  });

  it("describe fechas en relativo", () => {
    expect(relativeDayLabel("2026-08-25", "2026-08-25")).toBe("hoy");
    expect(relativeDayLabel("2026-08-26", "2026-08-25")).toBe("mañana");
    expect(relativeDayLabel("2026-08-24", "2026-08-25")).toBe("ayer");
    expect(relativeDayLabel("2026-08-28", "2026-08-25")).toBe("en 3 días");
    expect(relativeDayLabel("2026-08-20", "2026-08-25")).toBe("hace 5 días");
  });

  it("resuelve el día según la zona horaria indicada", () => {
    expect(todayInTimeZone("America/Santo_Domingo")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Kiritimati va 14 h por delante de Baker Island (-12): nunca coinciden.
    const adelante = todayInTimeZone("Pacific/Kiritimati");
    const atras = todayInTimeZone("Pacific/Midway");
    expect(adelante >= atras).toBe(true);
  });
});
