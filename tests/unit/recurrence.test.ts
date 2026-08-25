import { describe, expect, it } from "vitest";
import {
  advance,
  dueOccurrences,
  inferAnchorDay,
  intervalLabel,
  periodKey,
  periodRange,
  resolveStatusAfterRun,
  type OccurrenceSource,
} from "@/lib/recurrence";

const base: OccurrenceSource = {
  nextRunDate: "2026-08-23",
  interval: "monthly",
  intervalCount: 1,
  anchorDay: 23,
  endDate: null,
  maxOccurrences: null,
  occurrences: 0,
};

describe("advance", () => {
  it("avanza un ciclo de cada frecuencia", () => {
    expect(advance("2026-08-23", "weekly")).toBe("2026-08-30");
    expect(advance("2026-08-23", "monthly")).toBe("2026-09-23");
    expect(advance("2026-08-23", "quarterly")).toBe("2026-11-23");
    expect(advance("2026-08-23", "semiannual")).toBe("2027-02-23");
    expect(advance("2026-08-23", "yearly")).toBe("2027-08-23");
  });

  it("multiplica por intervalCount", () => {
    expect(advance("2026-08-23", "weekly", 2)).toBe("2026-09-06");
    expect(advance("2026-08-23", "monthly", 2)).toBe("2026-10-23");
    expect(advance("2026-01-01", "monthly", 6)).toBe("2026-07-01");
  });

  it("trata un intervalCount inválido como 1", () => {
    expect(advance("2026-08-23", "monthly", 0)).toBe("2026-09-23");
  });

  it("mantiene el día pactado al pasar por febrero", () => {
    const feb = advance("2026-01-31", "monthly", 1, 31);
    expect(feb).toBe("2026-02-28");
    expect(advance(feb, "monthly", 1, 31)).toBe("2026-03-31");
  });
});

describe("periodRange", () => {
  it("cubre desde la emisión hasta el día antes del siguiente ciclo", () => {
    expect(periodRange("2026-09-01", "monthly")).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    });
    expect(periodRange("2026-01-01", "quarterly")).toEqual({
      start: "2026-01-01",
      end: "2026-03-31",
    });
  });

  it("la clave del período es la fecha programada", () => {
    expect(periodKey("2026-09-23")).toBe("2026-09-23");
  });
});

describe("dueOccurrences", () => {
  it("no devuelve nada si el próximo ciclo aún no vence", () => {
    expect(dueOccurrences(base, "2026-08-22")).toHaveLength(0);
  });

  it("devuelve el ciclo del mismo día del corte", () => {
    const ciclos = dueOccurrences(base, "2026-08-23");
    expect(ciclos).toHaveLength(1);
    expect(ciclos[0].scheduledDate).toBe("2026-08-23");
    expect(ciclos[0].periodStart).toBe("2026-08-23");
    expect(ciclos[0].periodEnd).toBe("2026-09-22");
  });

  it("recupera los ciclos atrasados en orden", () => {
    // El cron estuvo caído desde agosto; el corte es en diciembre.
    const ciclos = dueOccurrences(base, "2026-12-31");
    expect(ciclos.map((c) => c.scheduledDate)).toEqual([
      "2026-08-23",
      "2026-09-23",
      "2026-10-23",
      "2026-11-23",
      "2026-12-23",
    ]);
  });

  it("limita cuántos atrasos recupera por corrida", () => {
    // Un startDate muy antiguo no debe generar cientos de facturas de golpe.
    const ciclos = dueOccurrences({ ...base, nextRunDate: "2020-01-23" }, "2026-12-31", 3);
    expect(ciclos).toHaveLength(3);
    expect(ciclos[0].scheduledDate).toBe("2020-01-23");
  });

  it("se detiene en la fecha de fin", () => {
    const ciclos = dueOccurrences({ ...base, endDate: "2026-10-01" }, "2026-12-31");
    expect(ciclos.map((c) => c.scheduledDate)).toEqual(["2026-08-23", "2026-09-23"]);
  });

  it("se detiene al alcanzar el máximo de emisiones", () => {
    const ciclos = dueOccurrences(
      { ...base, maxOccurrences: 3, occurrences: 1 },
      "2026-12-31",
    );
    expect(ciclos).toHaveLength(2);
  });

  it("no emite nada si el máximo ya se alcanzó", () => {
    expect(
      dueOccurrences({ ...base, maxOccurrences: 2, occurrences: 2 }, "2026-12-31"),
    ).toHaveLength(0);
  });

  it("genera claves de período únicas", () => {
    const ciclos = dueOccurrences(base, "2027-06-30", 12);
    const claves = new Set(ciclos.map((c) => c.periodKey));
    expect(claves.size).toBe(ciclos.length);
  });
});

describe("resolveStatusAfterRun", () => {
  it("sigue activa mientras queden ciclos", () => {
    expect(resolveStatusAfterRun(base, "2026-09-23", 1)).toBe("active");
  });

  it("finaliza al pasarse de la fecha de fin", () => {
    expect(
      resolveStatusAfterRun({ ...base, endDate: "2026-09-01" }, "2026-09-23", 1),
    ).toBe("finished");
  });

  it("finaliza al completar el máximo de emisiones", () => {
    expect(
      resolveStatusAfterRun({ ...base, maxOccurrences: 2 }, "2026-09-23", 2),
    ).toBe("finished");
  });
});

describe("etiquetas", () => {
  it("deduce el día de anclaje", () => {
    expect(inferAnchorDay("2026-08-23", "monthly")).toBe(23);
    // 2026-08-23 es domingo.
    expect(inferAnchorDay("2026-08-23", "weekly")).toBe(0);
  });

  it("describe la frecuencia en español", () => {
    expect(intervalLabel("monthly")).toBe("Mensual");
    expect(intervalLabel("monthly", 2)).toBe("Cada 2 meses");
    expect(intervalLabel("weekly", 3)).toBe("Cada 3 semanas");
    expect(intervalLabel("yearly", 2)).toBe("Cada 2 años");
  });
});
