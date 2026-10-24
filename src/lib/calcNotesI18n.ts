/**
 * Calculator notes arrive as English sentences, from the offline engine
 * (offlineCalculators.ts) or the API (same wording, backend calculators.py /
 * ownership_costs.py). This maps the known sentences to locale strings and keeps
 * any unknown sentence as it came, so new server copy still shows (in English).
 */
type Vars = Record<string, string | number>;
type T = (key: string, fallback?: string, vars?: Vars) => string;
type Rule = { re: RegExp; tr: (t: T, m: RegExpMatchArray) => string };

const RULES: Rule[] = [
  { re: /^Calculated with ([\d.,]+) USD\/LKR rate\./, tr: (t, m) => t("calcNote.rate", "Calculated with {rate} USD/LKR rate.", { rate: m[1] }) },
  { re: /^Includes 50% CID surcharge per gazette\./, tr: (t) => t("calcNote.surcharge", "Includes 50% CID surcharge per gazette.") },
  { re: /^Sits under the 1500cc hybrid tax cliff band\./, tr: (t) => t("calcNote.hybridCliff", "Sits under the 1500cc hybrid tax cliff band.") },
  { re: /^Computed on-device \(offline engine\)\./, tr: (t) => t("calcNote.onDevice", "Computed on-device (offline engine).") },
  { re: /^Using live fuel prices from Octane API\./, tr: (t) => t("calcNote.liveFuel", "Using live fuel prices from Octane API.") },
  { re: /^Using fallback fuel prices\./, tr: (t) => t("calcNote.fallbackFuel", "Using fallback fuel prices.") },
  { re: /^Motorcycle flat revenue licence \(Motor Traffic Fees Regulations schedule\)\./, tr: (t) => t("calcNote.licenceMotorcycle", "Motorcycle flat revenue licence (Motor Traffic Fees Regulations schedule).") },
  { re: /^Three-wheeler \/ motor tricycle van flat revenue licence\./, tr: (t) => t("calcNote.licenceThreeWheeler", "Three-wheeler / motor tricycle van flat revenue licence.") },
  { re: /^Dual-purpose <1000 kg GVW baseline band \(confirm provincial \/ eRL figure\)\./, tr: (t) => t("calcNote.licenceDualPurpose", "Dual-purpose <1000 kg GVW baseline band (confirm provincial / eRL figure).") },
  {
    re: /^Motor car Schedule VI band for ~(\d+) kg unladen \((petrol-equivalent|diesel)\)\./,
    tr: (t, m) =>
      t("calcNote.licenceMotorCar", "Motor car Schedule VI band for ~{kg} kg unladen ({fuel}).", {
        kg: m[1],
        fuel: m[2] === "diesel" ? t("calcNote.fuelDiesel", "diesel") : t("calcNote.fuelPetrolEq", "petrol-equivalent"),
      }),
  },
  { re: /^Provincial eRL may differ — confirm before payment\./, tr: (t) => t("calcNote.provincialErl", "Provincial eRL may differ — confirm before payment.") },
  { re: /^Statutory-leaning first-year cash outlay \(licence \+ emission \+ TP\)\./, tr: (t) => t("calcNote.statutory", "Statutory-leaning first-year cash outlay (licence + emission + TP).") },
  { re: /^Comprehensive insurance and lease payments are separate\./, tr: (t) => t("calcNote.separate", "Comprehensive insurance and lease payments are separate.") },
  { re: /^Passenger import freeze lifted \(Feb 2025\); compound CID\/excise\/VAT still apply\./, tr: (t) => t("calcNote.freezeLifted", "Passenger import freeze lifted (Feb 2025); compound CID/excise/VAT still apply.") },
  { re: /^Passenger vehicle import freeze was still in force before Feb 2025\./, tr: (t) => t("calcNote.freezeActive", "Passenger vehicle import freeze was still in force before Feb 2025.") },
  {
    re: /^Model year (\d{4}) is ~(\d+) years old — typically outside practical used-import windows even after the ban lift\./,
    tr: (t, m) => t("calcNote.ageTooOld", "Model year {year} is ~{age} years old — typically outside practical used-import windows even after the ban lift.", { year: m[1], age: m[2] }),
  },
  {
    re: /^Model year (\d{4}) is ~(\d+) years old — used ICE\/hybrid imports often face age caps or extra scrutiny; verify current Customs circulars\./,
    tr: (t, m) => t("calcNote.ageReview", "Model year {year} is ~{age} years old — used ICE/hybrid imports often face age caps or extra scrutiny; verify current Customs circulars.", { year: m[1], age: m[2] }),
  },
  { re: /^Model year (\d{4}) is within a common used-import age window\./, tr: (t, m) => t("calcNote.ageOk", "Model year {year} is within a common used-import age window.", { year: m[1] }) },
  { re: /^Pure EV — often preferred under remittance \/ special-permit pathways; check permit stock\./, tr: (t) => t("calcNote.pureEv", "Pure EV — often preferred under remittance / special-permit pathways; check permit stock.") },
  { re: /^Diesel passenger cars face higher excise and revenue-licence bands — cost and policy risk higher\./, tr: (t) => t("calcNote.diesel", "Diesel passenger cars face higher excise and revenue-licence bands — cost and policy risk higher.") },
];

/** Translate a calculator note (one or more known English sentences). English passes through unchanged. */
export function localizeCalcNote(text: string | null | undefined, t: T): string {
  let rest = String(text ?? "").trim();
  if (!rest) return "";
  const out: string[] = [];
  while (rest) {
    const rule = RULES.find((r) => r.re.test(rest));
    if (rule) {
      const m = rest.match(rule.re) as RegExpMatchArray;
      out.push(rule.tr(t, m));
      rest = rest.slice(m[0].length).trim();
      continue;
    }
    // Unknown sentence: keep it verbatim up to the next sentence break.
    const cut = rest.search(/\.\s+(?=[A-Z])/);
    const end = cut === -1 ? rest.length : cut + 1;
    out.push(rest.slice(0, end));
    rest = rest.slice(end).trim();
  }
  return out.join(" ");
}
