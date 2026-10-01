import { describe, it, expect } from "vitest";
import { validateCapitalRisk } from "../src/api/modules/users/infrastructure/configValidation.js";

const valid = { montoOperacion: 35, maxTrades: 5, leverageMin: 1, leverageMax: 2 };

describe("validateCapitalRisk (hallazgo M6)", () => {
  it("acepta una configuración válida", () => {
    expect(validateCapitalRisk(valid)).toBeNull();
  });

  it("rechaza montoOperacion cero o negativo", () => {
    expect(validateCapitalRisk({ ...valid, montoOperacion: 0 })).not.toBeNull();
    expect(validateCapitalRisk({ ...valid, montoOperacion: -10 })).not.toBeNull();
  });

  it("acepta montoOperacion con 2 decimales, rechaza con 3", () => {
    expect(validateCapitalRisk({ ...valid, montoOperacion: 35.5 })).toBeNull();
    expect(validateCapitalRisk({ ...valid, montoOperacion: 35.55 })).toBeNull();
    expect(validateCapitalRisk({ ...valid, montoOperacion: 35.555 })).not.toBeNull();
  });

  it("no tiene tope superior en montoOperacion", () => {
    expect(validateCapitalRisk({ ...valid, montoOperacion: 1_000_000 })).toBeNull();
  });

  it("rechaza maxTrades fuera de 1-10 o no entero", () => {
    expect(validateCapitalRisk({ ...valid, maxTrades: 0 })).not.toBeNull();
    expect(validateCapitalRisk({ ...valid, maxTrades: 11 })).not.toBeNull();
    expect(validateCapitalRisk({ ...valid, maxTrades: 5.5 })).not.toBeNull();
    expect(validateCapitalRisk({ ...valid, maxTrades: 10 })).toBeNull();
  });

  it("rechaza leverageMin/leverageMax fuera de 1-10 o no enteros", () => {
    expect(validateCapitalRisk({ ...valid, leverageMin: 0 })).not.toBeNull();
    expect(validateCapitalRisk({ ...valid, leverageMax: 11 })).not.toBeNull();
    expect(validateCapitalRisk({ ...valid, leverageMin: 1.5 })).not.toBeNull();
    expect(validateCapitalRisk({ ...valid, leverageMax: 10 })).toBeNull();
  });

  it("rechaza leverageMin > leverageMax (el caso del hallazgo M6)", () => {
    const error = validateCapitalRisk({ ...valid, leverageMin: 8, leverageMax: 5 });
    expect(error).not.toBeNull();
    expect(error).toContain("leverageMin");
  });

  it("acepta leverageMin == leverageMax", () => {
    expect(validateCapitalRisk({ ...valid, leverageMin: 5, leverageMax: 5 })).toBeNull();
  });
});
