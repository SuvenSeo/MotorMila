import { describe, expect, it } from "vitest";

import {
  canonicalizeMake,
  canonicalizeModel,
  hasUsableMakeModel,
  isJunkMake,
  modelContainsForeignMake,
} from "@/lib/makeNormalization";

describe("canonicalizeMake", () => {
  it("merges duplicate spellings of the same brand", () => {
    expect(canonicalizeMake("Bmw")).toBe("BMW");
    expect(canonicalizeMake("BMW")).toBe("BMW");
    expect(canonicalizeMake("Mg")).toBe("MG");
    expect(canonicalizeMake("MG")).toBe("MG");
    expect(canonicalizeMake("Dfsk")).toBe("DFSK");
    expect(canonicalizeMake("TOYOTA")).toBe("Toyota");
    expect(canonicalizeMake("SUZUKI")).toBe("Suzuki");
    expect(canonicalizeMake("KIA")).toBe("Kia");
    expect(canonicalizeMake("Land rover")).toBe("Land Rover");
    expect(canonicalizeMake("proton")).toBe("Proton");
  });

  it("repairs typo spellings seen in live listings", () => {
    expect(canonicalizeMake("Mitshubishi")).toBe("Mitsubishi");
    expect(canonicalizeMake("Sukuzi")).toBe("Suzuki");
    expect(canonicalizeMake("Nisan")).toBe("Nissan");
    expect(canonicalizeMake("Daihatzu")).toBe("Daihatsu");
    expect(canonicalizeMake("Cheery")).toBe("Chery");
  });

  it("keeps genuine multi-word marques", () => {
    expect(canonicalizeMake("Ashok Leyland")).toBe("Ashok Leyland");
    expect(canonicalizeMake("Royal Enfield")).toBe("Royal Enfield");
    expect(canonicalizeMake("John Deere")).toBe("John Deere");
  });

  it("preserves short brand acronyms instead of lowercasing them", () => {
    expect(canonicalizeMake("TVS")).toBe("TVS");
    expect(canonicalizeMake("JAC")).toBe("JAC");
    expect(canonicalizeMake("BYD")).toBe("BYD");
  });

  it("repairs a model that leaked into the make column", () => {
    expect(canonicalizeMake("Honda fit")).toBe("Honda");
    expect(canonicalizeMake("Jeep Wrangler")).toBe("Jeep");
    expect(canonicalizeMake("BAIC Beijing")).toBe("BAIC");
  });

  it("drops junk, test, and year values so they never reach the combobox", () => {
    for (const junk of ["Test", "TestPOS", "testused", "Other brand", "Other Brand", "2018", "2016", ""]) {
      expect(canonicalizeMake(junk)).toBeNull();
      expect(isJunkMake(junk)).toBe(true);
    }
  });
});

describe("canonicalizeModel", () => {
  it("trims and collapses whitespace", () => {
    expect(canonicalizeModel("  Vitz  ")).toBe("Vitz");
  });

  it("drops junk models", () => {
    expect(canonicalizeModel("Test")).toBe("");
    expect(canonicalizeModel("2018")).toBe("");
  });
});

describe("hasUsableMakeModel", () => {
  it("rejects the unnamed listing that was featured as a hero deal", () => {
    expect(hasUsableMakeModel("Other brand", "Other model")).toBe(false);
    expect(hasUsableMakeModel("Test", "TestPOS")).toBe(false);
  });

  it("accepts a real car", () => {
    expect(hasUsableMakeModel("Toyota", "Vitz")).toBe(true);
  });
});

describe("QA round 2: observed live pollution", () => {
  it("recovers makes polluted with model/year fragments", () => {
    expect(canonicalizeMake("2016 Suzuki Spacia Custom Turbo 2016")).toBe("Suzuki");
    expect(canonicalizeMake("2017 Toyota Allion 260 G 2017")).toBe("Toyota");
    expect(canonicalizeMake("2018 Honda N-wgn Custom, TWO TONE 2018")).toBe("Honda");
  });

  it("rejects junk makes like '2012 Gp 1 2012' and '95 2026'", () => {
    expect(canonicalizeMake("2012 Gp 1 2012")).toBeNull();
    expect(canonicalizeMake("95 2026")).toBeNull();
  });

  it("maps observed model misspellings to their canonical names", () => {
    expect(canonicalizeModel("Corollla")).toBe("Corolla");
    expect(canonicalizeModel("Coroola")).toBe("Corolla");
    expect(canonicalizeModel("Perimio")).toBe("Premio");
    expect(canonicalizeModel("Hillux")).toBe("Hilux");
    expect(canonicalizeModel("Spriter")).toBe("Sprinter");
    expect(canonicalizeModel("Dolping")).toBe("Dolphin");
  });

  it("filters whole-value junk models", () => {
    for (const junk of ["Other Model", "Suv", "Hybrid", "Electric", "Fully", "Lorry", "Double", "Highest", "Long"]) {
      expect(canonicalizeModel(junk)).toBe("");
    }
  });

  it("filters seller phone numbers and known marques as models", () => {
    expect(canonicalizeModel("0771234567")).toBe("");
    expect(canonicalizeModel("+94 77 123 4567")).toBe("");
    expect(canonicalizeModel("Toyota")).toBe("");
    expect(canonicalizeModel("Suzuki")).toBe("");
  });

  it("filters district names and 'Sri Lanka' as models", () => {
    for (const junk of ["Colombo", "Kandy", "Gampaha", "Sri Lanka", "Kurunegala"]) {
      expect(canonicalizeModel(junk)).toBe("");
    }
  });

  it("keeps legitimate models", () => {
    expect(canonicalizeModel("Aqua")).toBe("Aqua");
    expect(canonicalizeModel("Vitz")).toBe("Vitz");
    expect(canonicalizeModel("Wagon R")).toBe("Wagon R");
    expect(canonicalizeModel("Alto")).toBe("Alto");
  });

  it("filters equipment fragments and near-misspellings of junk words", () => {
    // "Fork" is a truncated "Forklift"; "Eliphent" is a misspelling of "Elephant".
    for (const junk of ["Fork", "Eliphent", "Elephent", "Forklif", "Shel", "Japn", "Door"]) {
      expect(canonicalizeModel(junk)).toBe("");
    }
  });

  it("treats truck makes as foreign when they appear as models", () => {
    expect(modelContainsForeignMake("Hino", "Toyota")).toBe(true);
    expect(modelContainsForeignMake("Hino", "Hino")).toBe(false);
  });

  it("does not fuzzy-kill real models near junk words", () => {
    expect(canonicalizeModel("Aqua")).toBe("Aqua");
    expect(canonicalizeModel("Passo")).toBe("Passo");
  });
});

describe("collectMakeModelRows", () => {
  // Lazy import to keep the normalization suite fast when api.ts is heavy.
  const load = () => import("@/services/api").then((m) => m.collectMakeModelRows);

  it("resolves a slug to a multi-word display-name key", async () => {
    const collect = await load();
    const snapshot = { "Land Rover": [{ model: "Defender", count: 5 }] };
    expect(collect(snapshot, "land-rover")).toEqual([{ model: "Defender", count: 5 }]);
  });

  it("merges rows from all keys that canonicalize to the same make", async () => {
    const collect = await load();
    const snapshot = {
      // Polluted key sorts first in insertion order — it must not shadow Toyota.
      "2017 Toyota Allion 260 G 2017": [{ model: "Toyota Allion 260 G", count: 1 }],
      Toyota: [
        { model: "Vitz", count: 100 },
        { model: "Aqua", count: 90 },
      ],
    };
    const rows = collect(snapshot, "toyota");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.model)).toContain("Vitz");
  });

  it("returns no rows for an unknown make", async () => {
    const collect = await load();
    expect(collect({ Toyota: [{ model: "Vitz", count: 1 }] }, "zzzzz")).toEqual([]);
  });
});

describe("Range Rover handling", () => {
  it("keeps Range Rover as a model (it is not a marque)", () => {
    expect(canonicalizeModel("Range Rover")).toBe("Range Rover");
    expect(canonicalizeModel("Range Rover Evoque")).toBe("Range Rover Evoque");
  });

  it("folds a Range Rover make into Land Rover", () => {
    expect(canonicalizeMake("Range Rover")).toBe("Land Rover");
  });
});

describe("snapshot junk filters (visual-QA round 2)", () => {
  it("drops country / town / dealer-word / equipment leaks from models", () => {
    for (const junk of ["Japan", "Malabe", "Katugastota", "Panadura", "Badulla", "Kadawatha", "Elephant", "Shell", "Forklift", "Road Roller"]) {
      expect(canonicalizeModel(junk)).toBe("");
    }
  });

  it("drops test/fixture rows from models and makes", () => {
    expect(canonicalizeModel("Test Allion 2005")).toBe("");
    expect(isJunkMake("Test Allion 2005")).toBe(true);
    expect(isJunkMake("Test Test 2010")).toBe(true);
  });

  it("drops makes that embed a model year or lead with a trim/fuel word", () => {
    expect(isJunkMake("Auchev Pisces 2026")).toBe(true);
    expect(isJunkMake("ABL Zibo Lorry Budy 2011")).toBe(true);
    expect(isJunkMake("Vitz Car Car 2022")).toBe(true);
    expect(isJunkMake("Electric 2026")).toBe(true);
    // Real makes are unaffected.
    expect(isJunkMake("Toyota")).toBe(false);
    expect(isJunkMake("Mercedes Benz")).toBe(false);
  });

  it("detects foreign-marque models but keeps own-make compounds", () => {
    expect(modelContainsForeignMake("Toyota Aqua", "Land Rover")).toBe(true);
    expect(modelContainsForeignMake("Bmw 2", "Land Rover")).toBe(true);
    expect(modelContainsForeignMake("Mercedes Benz C180", "Mercedes")).toBe(false);
    expect(modelContainsForeignMake("Toyota Allion", "Toyota")).toBe(false);
    expect(modelContainsForeignMake("Range Rover", "Land Rover")).toBe(false);
    expect(modelContainsForeignMake("Aqua", "Toyota")).toBe(false);
  });
});

describe("known cross-make model misattributions", () => {
  it("drops other marques' models under the wrong make, keeps them under their own", () => {
    expect(modelContainsForeignMake("Navara", "Toyota")).toBe(true);
    expect(modelContainsForeignMake("Sonet", "Toyota")).toBe(true);
    expect(modelContainsForeignMake("Navara", "Nissan")).toBe(false);
    expect(modelContainsForeignMake("Seltos", "Kia")).toBe(false);
  });
});
