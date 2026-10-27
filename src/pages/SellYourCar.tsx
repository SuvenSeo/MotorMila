import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, Circle, FileText, ImageOff, LogIn, MapPin, Pencil, Phone, Tag } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";
import { createMyListing, getUploadsConfig, requestUploadTicket, type MyListingInput } from "@/services/api";
import { usePhotoUploads } from "@/hooks/usePhotoUploads";
import { DEFAULT_MAX_BYTES, MAX_PHOTOS, doneUrls, hasFailures, isBusy } from "@/lib/photoUpload";
import { PhotoUploader } from "@/components/sell/PhotoUploader";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { CineHeader } from "@/components/CineHeader";
import { visuals } from "@/lib/visualAssets";
import { silhouetteFor } from "@/lib/vehicleSilhouette";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/ui/select";
import { AdornedInput, AnimatedLkr, ChoiceChips, Field, FormCard, Notice } from "@/components/tools/ToolKit";
import "@/styles/cinematic-pages.css";

const MAKES = [
  "Toyota", "Suzuki", "Honda", "Nissan", "Mitsubishi", "Mazda",
  "Hyundai", "Kia", "BMW", "Mercedes-Benz", "Audi", "Perodua",
  "Micro", "DFSK", "Chery", "BYD", "MG", "Other",
];
// Values stay English (they are sent to the API); labels are translated.
const FUEL_TYPES = [
  { value: "Petrol", key: "fuel.petrol" },
  { value: "Diesel", key: "fuel.diesel" },
  { value: "Hybrid", key: "fuel.hybrid" },
  { value: "Electric", key: "fuel.electric" },
  { value: "CNG", key: "fuel.cng" },
];
const TRANSMISSIONS = [
  { value: "Automatic", key: "trans.automatic" },
  { value: "Manual", key: "trans.manual" },
  { value: "CVT", key: "trans.cvt" },
];
const CONDITIONS = [
  { value: "Used", key: "condition.used" },
  { value: "Reconditioned", key: "condition.reconditioned" },
  { value: "Brand New", key: "condition.brandNew" },
];
const CATEGORY_KEYS = ["cars", "bikes", "tuk", "van", "suv"] as const;
const DISTRICTS = [
  "Colombo", "Gampaha", "Kalutara", "Kandy", "Matale", "Nuwara Eliya",
  "Galle", "Matara", "Hambantota", "Jaffna", "Kilinochchi", "Mannar",
  "Vavuniya", "Mullaitivu", "Batticaloa", "Ampara", "Trincomalee",
  "Kurunegala", "Puttalam", "Anuradhapura", "Polonnaruwa", "Badulla",
  "Monaragala", "Ratnapura", "Kegalle",
];

type FormState = {
  make: string;
  model: string;
  year: string;
  priceLkr: string;
  mileage: string;
  fuelType: string;
  transmission: string;
  condition: string;
  bodyType: string;
  vehicleCategory: string;
  district: string;
  city: string;
  title: string;
  description: string;
  contactName: string;
  contactPhone: string;
};

const INITIAL: FormState = {
  make: "", model: "", year: "", priceLkr: "", mileage: "",
  fuelType: "Petrol", transmission: "Automatic", condition: "Used",
  bodyType: "", vehicleCategory: "cars", district: "", city: "",
  title: "", description: "", contactName: "", contactPhone: "",
};

const currentYear = new Date().getFullYear();

export default function SellYourCar() {
  const { t } = useAppPreferences();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [uploadsEnabled, setUploadsEnabled] = useState(false);
  const [maxBytes, setMaxBytes] = useState(DEFAULT_MAX_BYTES);
  const [submitting, setSubmitting] = useState(false);
  const [successFlash, setSuccessFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [brokenCover, setBrokenCover] = useState<string | null>(null);
  /** Guided flow: vehicle → price → photos → location & contact → review. */
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const flowTop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user?.email) {
      setForm((f) => (f.contactName ? f : { ...f, contactName: user.name || "" }));
    }
  }, [user]);

  // Uploads need a signed-in account and a backend that can issue R2 URLs;
  // otherwise the section falls back to adding photos by link.
  useEffect(() => {
    if (!isAuthenticated) {
      setUploadsEnabled(false);
      return;
    }
    let cancelled = false;
    void getUploadsConfig().then((cfg) => {
      if (cancelled) return;
      setUploadsEnabled(cfg.enabled);
      if (cfg.maxBytes > 0) setMaxBytes(Math.min(cfg.maxBytes, DEFAULT_MAX_BYTES));
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const photos = usePhotoUploads({ requestTicket: requestUploadTicket, maxBytes });
  const imageUrls = useMemo(() => doneUrls(photos.items), [photos.items]);
  const photosBusy = isBusy(photos.items);
  const photosFailed = hasFailures(photos.items);

  const setField = useCallback((key: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  }, []);

  const canSubmit = useMemo(
    () =>
      form.make.trim() && form.model.trim() && form.contactPhone.trim() && !submitting && isAuthenticated && !photosBusy && !photosFailed,
    [form.make, form.model, form.contactPhone, submitting, isAuthenticated, photosBusy, photosFailed],
  );

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isAuthenticated) {
        setError(t("sell.signInRequired", "Please sign in to list your vehicle."));
        return;
      }
      if (!canSubmit) return;
      setSubmitting(true);
      setError(null);
      try {
        const payload: MyListingInput = {
          make: form.make.trim(),
          model: form.model.trim(),
          year: form.year ? Number(form.year) : undefined,
          priceLkr: form.priceLkr ? Number(form.priceLkr) : undefined,
          mileage: form.mileage ? Number(form.mileage) : undefined,
          fuelType: form.fuelType || undefined,
          transmission: form.transmission || undefined,
          condition: form.condition || undefined,
          bodyType: form.bodyType.trim() || undefined,
          vehicleCategory: form.vehicleCategory || "cars",
          district: form.district.trim() || undefined,
          city: form.city.trim() || undefined,
          title: form.title.trim() || undefined,
          description: form.description.trim() || undefined,
          contactName: form.contactName.trim() || undefined,
          contactPhone: form.contactPhone.trim(),
          imageUrls,
        };
        await createMyListing(payload);
        trackEvent("sell_listing_created", {
          make: payload.make,
          model: payload.model,
          vehicleCategory: payload.vehicleCategory,
          hasPrice: Boolean(payload.priceLkr),
          imageCount: payload.imageUrls?.length ?? 0,
        });
        // Let the button show the tick before the form swaps out.
        setSuccessFlash(true);
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        setDone(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (err) {
        setError(err instanceof Error ? err.message : t("sell.submitFailed", "Could not publish your listing. Try again."));
      } finally {
        setSubmitting(false);
        setSuccessFlash(false);
      }
    },
    [canSubmit, form, imageUrls, isAuthenticated, t],
  );

  const categories = CATEGORY_KEYS.map((key) => ({
    value: key,
    label: t(`tools.sell.cat.${key}`, { cars: "Car", bikes: "Bike", tuk: "Tuk", van: "Van", suv: "SUV" }[key]),
  }));
  const req = <span className="text-deal-high-text"> *</span>;

  /* ── Steps ────────────────────────────────────────────────────────────── */
  const STEPS = [
    { key: "vehicle", label: t("sell.step.vehicle", "Vehicle"), icon: Tag },
    { key: "price", label: t("sell.step.price", "Price"), icon: FileText },
    { key: "photos", label: t("sell.step.photos", "Photos"), icon: Camera },
    { key: "contact", label: t("sell.step.contact", "Location & contact"), icon: Phone },
    { key: "review", label: t("sell.step.review", "Review"), icon: CheckCircle2 },
  ] as const;
  const last = STEPS.length - 1;
  /** Required fields per step (the rest are optional, as before). */
  const stepProblem = (i: number): string | null => {
    if (i === 0 && !(form.make.trim() && form.model.trim())) return t("sell.step.needVehicle", "Choose a make and type the model to continue.");
    if (i === 3 && !form.contactPhone.trim()) return t("sell.step.needPhone", "Add a phone number so buyers can reach you.");
    return null;
  };
  const goTo = (i: number) => {
    setStepError(null);
    setStep(Math.max(0, Math.min(last, i)));
    const top = flowTop.current;
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start" });
  };
  const next = () => {
    const problem = stepProblem(step);
    if (problem) {
      setStepError(problem);
      return;
    }
    goTo(step + 1);
  };

  /* ── Live ad card ─────────────────────────────────────────────────────── */
  const previewTitle =
    form.title.trim() || [form.year, form.make, form.model].filter(Boolean).join(" ") || t("tools.sell.previewEmpty", "Your vehicle");
  const cover = photos.items[0]?.previewUrl ?? undefined;
  const price = Number(form.priceLkr);
  const mileage = Number(form.mileage);
  const plate = silhouetteFor({
    vehicle_category: { cars: "cars", bikes: "motorbikes", tuk: "three-wheelers", van: "vans", suv: "suvs" }[form.vehicleCategory] ?? "cars",
  });
  const checks = [
    { done: Boolean(form.make && form.model.trim()), label: t("tools.sell.check.vehicle", "Make and model"), step: 0 },
    { done: Boolean(form.priceLkr), label: t("tools.sell.check.price", "Asking price"), step: 1 },
    { done: imageUrls.length > 0, label: t("tools.sell.check.photos", "At least one photo"), step: 2 },
    { done: Boolean(form.district), label: t("tools.sell.check.location", "District"), step: 3 },
    { done: Boolean(form.contactPhone.trim()), label: t("tools.sell.check.phone", "Phone number"), step: 3 },
  ];
  const completed = checks.filter((c) => c.done).length;

  const adCard = (
    <div className="overflow-hidden rounded-sheet border border-border bg-card shadow-e2" aria-label={t("tools.sell.preview", "Ad preview")}>
      <div className="cine-adcard__photo">
        {cover && brokenCover !== cover ? (
          <img key={cover} src={cover} alt="" className="content-in" onError={() => setBrokenCover(cover)} />
        ) : (
          <>
            <picture>
              <source type="image/avif" srcSet={`${plate.avifSm} 480w, ${plate.avif} 960w`} sizes="420px" />
              <img src={plate.webp} srcSet={`${plate.webpSm} 480w, ${plate.webp} 960w`} sizes="420px" alt="" />
            </picture>
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10 text-caption font-medium text-white/80">
              {cover ? <ImageOff className="h-3.5 w-3.5" aria-hidden /> : <Camera className="h-3.5 w-3.5" aria-hidden />}
              {cover ? t("tools.sell.coverBroken", "This photo link doesn't load") : t("tools.sell.coverEmpty", "Your cover photo shows here")}
            </div>
          </>
        )}
        <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-caption font-semibold text-white">
          {t("tools.sell.preview", "Ad preview")}
        </span>
        {imageUrls.length > 1 && (
          <span className="num absolute right-3 top-3 flex items-center gap-1 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-caption font-semibold text-white">
            <Camera aria-hidden className="h-3 w-3" /> {imageUrls.length}
          </span>
        )}
      </div>
      <div className="p-5">
        <p className="truncate text-callout font-semibold text-foreground">{previewTitle}</p>
        <p className="cine-card__price mt-1 text-title1 text-foreground">
          {price > 0 ? <AnimatedLkr value={price} mode="full" /> : <span className="text-label-3">{t("tools.sell.noPrice", "Add a price")}</span>}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {mileage > 0 ? <Badge variant="neutral" className="num">{mileage.toLocaleString("en-US")} km</Badge> : null}
          <Badge variant="neutral">{t(FUEL_TYPES.find((f) => f.value === form.fuelType)?.key ?? "", form.fuelType)}</Badge>
          <Badge variant="neutral">{t(TRANSMISSIONS.find((f) => f.value === form.transmission)?.key ?? "", form.transmission)}</Badge>
          {form.district ? (
            <Badge variant="neutral">
              <MapPin aria-hidden /> {form.city ? `${form.city}, ${form.district}` : form.district}
            </Badge>
          ) : null}
        </div>
        {form.description.trim() ? (
          <p className="mt-3 line-clamp-2 text-footnote leading-relaxed text-label-2">{form.description.trim()}</p>
        ) : null}
      </div>
      <div className="border-t border-border px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-footnote font-semibold text-foreground">{t("tools.sell.checklist", "Ready to publish")}</p>
          <p className="num text-footnote text-label-2">
            {completed} / {checks.length}
          </p>
        </div>
        <div className="cine-step-rail mt-2.5">
          <span className="cine-step-rail__fill bg-deal-good" style={{ "--p": completed / checks.length } as CSSProperties} />
        </div>
        <ul className="mt-3 grid gap-1">
          {checks.map((c) => (
            <li key={c.label}>
              <button
                type="button"
                onClick={() => goTo(c.step)}
                className={cn(
                  "flex min-h-8 w-full items-center gap-2 rounded-control text-left text-footnote transition-colors duration-short ease-standard hover:text-foreground",
                  c.done ? "text-foreground" : "text-label-2",
                )}
              >
                {c.done ? <CheckCircle2 className="h-4 w-4 text-deal-good-text" aria-hidden /> : <Circle className="h-4 w-4 text-label-3" aria-hidden />}
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  /* ── Step bar ─────────────────────────────────────────────────────────── */
  const stepBar = (
    <nav aria-label={t("sell.step.nav", "Listing steps")} className="mb-5">
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {STEPS.map((s, i) => (
          <li key={s.key} className={cn("flex min-w-0 items-center gap-1.5 sm:gap-2", i < last && "flex-1")}>
            <button
              type="button"
              onClick={() => goTo(i)}
              aria-current={i === step ? "step" : undefined}
              data-state={i === step ? "current" : i < step ? "done" : "todo"}
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="cine-step-dot num">{i < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}</span>
              <span className={cn("hidden whitespace-nowrap text-footnote font-semibold lg:inline", i === step ? "text-foreground" : "text-label-2")}>{s.label}</span>
            </button>
            {i < last && (
              <span aria-hidden className="cine-step-rail min-w-3 flex-1">
                <span className="cine-step-rail__fill" style={{ "--p": i < step ? 1 : 0 } as CSSProperties} />
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-caption font-medium text-label-2 lg:hidden">
        {t("sell.step.of", "Step {n} of {total}", { n: step + 1, total: STEPS.length })} · <span className="text-foreground">{STEPS[step].label}</span>
      </p>
    </nav>
  );

  const summaryRows: Array<{ label: string; value: string; step: number }> = [
    { label: t("sell.step.vehicle", "Vehicle"), value: [form.year, form.make, form.model].filter(Boolean).join(" ") || "—", step: 0 },
    { label: t("sell.step.price", "Price"), value: price > 0 ? `Rs ${price.toLocaleString("en-US")}` : "—", step: 1 },
    { label: t("sell.step.photos", "Photos"), value: t("sell.photos.countLabel", "{n} of {max} photos", { n: photos.items.length, max: MAX_PHOTOS }), step: 2 },
    { label: t("sell.district", "District"), value: [form.city, form.district].filter(Boolean).join(", ") || "—", step: 3 },
    { label: t("sell.contactPhone", "Phone number"), value: form.contactPhone.trim() || "—", step: 3 },
  ];

  /* ── Form ─────────────────────────────────────────────────────────────── */
  // Every step stays mounted (hidden when not current): photo uploads keep
  // running and the uploader keeps its state while the seller moves around.
  const formView = (
    <form
      onSubmit={(e) => {
        if (step < last) {
          e.preventDefault();
          next();
          return;
        }
        void onSubmit(e);
      }}
      className="space-y-5"
      noValidate
    >
      {!isAuthenticated && (
        <Notice
          tone="info"
          icon={LogIn}
          title={t("sell.signInNotice", "You need to sign in to publish a listing.")}
          action={
            <Button type="button" size="sm" onClick={() => navigate("/sign-in")}>
              {t("sell.signInCta", "Sign in")}
            </Button>
          }
        />
      )}

      {stepBar}

      <div hidden={step !== 0} className={step === 0 ? "cine-pane" : undefined}>
      <FormCard icon={Tag} title={t("sell.sectionVehicle", "Vehicle details")}>
        <ChoiceChips label={t("tools.sell.category", "Type")} value={form.vehicleCategory as (typeof CATEGORY_KEYS)[number]} options={categories} onChange={(v) => setField("vehicleCategory", v)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={<>{t("sell.make", "Make")}{req}</>} htmlFor="sell-make">
            <SimpleSelect
              id="sell-make"
              required
              value={form.make}
              onValueChange={(v) => setField("make", v)}
              placeholder={t("sell.selectMake", "Select make")}
              options={MAKES.map((mk) => ({ value: mk, label: mk }))}
            />
          </Field>
          <Field label={<>{t("sell.model", "Model")}{req}</>} htmlFor="sell-model">
            <Input id="sell-model" required value={form.model} onChange={(e) => setField("model", e.target.value)} placeholder={t("sell.modelPh", "e.g. Axio, Vitz, Hilux")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("sell.year", "Year")} htmlFor="sell-year">
            <SimpleSelect
              id="sell-year"
              value={String(form.year)}
              onValueChange={(v) => setField("year", v)}
              placeholder={t("sell.selectYear", "Select year")}
              options={Array.from({ length: 40 }, (_, i) => currentYear - i).map((y) => ({ value: String(y), label: y }))}
            />
          </Field>
          <Field label={t("sell.mileage", "Mileage (km)")} htmlFor="sell-mileage">
            <AdornedInput id="sell-mileage" type="number" min="0" inputMode="numeric" suffix="km" value={form.mileage} onChange={(e) => setField("mileage", e.target.value)} placeholder="85000" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("sell.fuel", "Fuel type")} htmlFor="sell-fuel">
            <SimpleSelect id="sell-fuel" value={form.fuelType} onValueChange={(v) => setField("fuelType", v)} options={FUEL_TYPES.map((f) => ({ value: f.value, label: t(f.key, f.value) }))} />
          </Field>
          <Field label={t("sell.transmission", "Transmission")} htmlFor="sell-transmission">
            <SimpleSelect
              id="sell-transmission"
              value={form.transmission}
              onValueChange={(v) => setField("transmission", v)}
              options={TRANSMISSIONS.map((tm) => ({ value: tm.value, label: t(tm.key, tm.value) }))}
            />
          </Field>
          <Field label={t("sell.condition", "Condition")} htmlFor="sell-condition">
            <SimpleSelect id="sell-condition" value={form.condition} onValueChange={(v) => setField("condition", v)} options={CONDITIONS.map((c) => ({ value: c.value, label: t(c.key, c.value) }))} />
          </Field>
        </div>
      </FormCard>
      </div>

      <div hidden={step !== 1} className={step === 1 ? "cine-pane" : undefined}>
      <FormCard icon={FileText} title={t("sell.step.priceTitle", "Price and headline")} description={t("sell.step.priceHint", "Leave the price empty if you'd rather take offers. A clear headline gets more clicks.")}>
        <Field label={t("sell.price", "Price (LKR)")} htmlFor="sell-price">
          <AdornedInput id="sell-price" type="number" min="0" inputMode="numeric" prefix="Rs" value={form.priceLkr} onChange={(e) => setField("priceLkr", e.target.value)} placeholder="5500000" />
        </Field>
        <Field label={t("sell.listingTitle", "Listing title")} htmlFor="sell-title">
          <Input id="sell-title" value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder={t("sell.titlePh", "e.g. 2018 Toyota Axio — well maintained, one owner")} />
        </Field>
        <Link to="/estimate" className="inline-flex items-center gap-1.5 text-footnote font-semibold text-primary no-underline hover:underline">
          {t("sell.step.checkValue", "Check what similar vehicles are listed for")} <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </FormCard>
      </div>

      <div hidden={step !== 2} className={step === 2 ? "cine-pane" : undefined}>
      <FormCard
        icon={Camera}
        title={t("sell.sectionPhotos", "Photos")}
        description={
          uploadsEnabled
            ? t("sell.photos.hint", "Add up to 12 photos from your phone or computer. The first one is your cover.")
            : t("sell.imageHint", "Add up to 12 photos. Hosted on any public image URL — the first becomes your cover.")
        }
        action={
          photos.items.length > 0 ? (
            <span className="text-footnote tabular-nums text-label-2" aria-label={t("sell.photos.countLabel", "{n} of {max} photos", { n: photos.items.length, max: MAX_PHOTOS })}>
              {photos.items.length} / {MAX_PHOTOS}
            </span>
          ) : undefined
        }
      >
        <PhotoUploader photos={photos} uploadsEnabled={uploadsEnabled} />
      </FormCard>
      </div>

      <div hidden={step !== 3} className={step === 3 ? "cine-pane space-y-5" : "space-y-5"}>
      <FormCard icon={MapPin} title={t("sell.sectionLocation", "Location")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("sell.district", "District")} htmlFor="sell-district">
            <SimpleSelect
              id="sell-district"
              value={form.district}
              onValueChange={(v) => setField("district", v)}
              placeholder={t("sell.selectDistrict", "Select district")}
              options={DISTRICTS.map((d) => ({ value: d, label: d }))}
            />
          </Field>
          <Field label={t("sell.city", "City")} htmlFor="sell-city">
            <Input id="sell-city" value={form.city} onChange={(e) => setField("city", e.target.value)} placeholder={t("sell.cityPh", "e.g. Dehiwala")} />
          </Field>
        </div>
      </FormCard>
      <FormCard icon={Phone} title={t("sell.sectionContact", "Contact")} description={t("sell.contactHint", "Your phone is shown to signed-in buyers so they can contact you directly.")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("sell.contactName", "Your name")} htmlFor="sell-contact-name">
            <Input id="sell-contact-name" autoComplete="name" value={form.contactName} onChange={(e) => setField("contactName", e.target.value)} placeholder={t("sell.contactNamePh", "Name shown to buyers")} />
          </Field>
          <Field label={<>{t("sell.contactPhone", "Phone number")}{req}</>} htmlFor="sell-contact-phone">
            <Input id="sell-contact-phone" type="tel" autoComplete="tel" required value={form.contactPhone} onChange={(e) => setField("contactPhone", e.target.value)} placeholder="07X XXX XXXX" />
          </Field>
        </div>
      </FormCard>
      </div>

      <div hidden={step !== 4} className={step === 4 ? "cine-pane space-y-5" : "space-y-5"}>
        {/* Phones: the live card sits here, right above Publish. */}
        <div className="lg:hidden">{adCard}</div>
        <FormCard icon={FileText} title={t("sell.sectionDesc", "Description")}>
          <Field label={t("sell.description", "Details")} htmlFor="sell-desc" aside={`${form.description.length} / 4000`}>
            <Textarea
              id="sell-desc"
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder={t("sell.descPh", "Service history, condition, why you're selling, accessories, anything buyers should know…")}
            />
          </Field>
        </FormCard>
        <section aria-labelledby="sell-review-title" className="rounded-card border border-border bg-card">
          <h2 id="sell-review-title" className="cine-eyebrow px-5 pt-4 text-muted-foreground">{t("sell.step.review", "Review")}</h2>
          <dl className="mt-2 divide-y divide-border">
            {summaryRows.map((r) => (
              <div key={r.label} className="flex items-center gap-3 px-5 py-3">
                <dt className="w-28 shrink-0 text-caption font-medium text-label-2 sm:w-36">{r.label}</dt>
                <dd className="num min-w-0 flex-1 truncate text-footnote font-semibold text-foreground">{r.value}</dd>
                <button
                  type="button"
                  onClick={() => goTo(r.step)}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-control px-2 text-caption font-semibold text-primary hover:bg-primary/10"
                >
                  <Pencil aria-hidden className="h-3 w-3" /> {t("sell.step.edit", "Edit")}
                </button>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {(error || stepError) && (
        <Notice tone="danger" role="alert">
          {error ?? stepError}
        </Notice>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        {step > 0 && (
          <Button type="button" variant="secondary" size="lg" onClick={() => goTo(step - 1)}>
            <ArrowLeft aria-hidden /> {t("sell.step.back", "Back")}
          </Button>
        )}
        {step < last ? (
          // Distinct keys: swapping one <button> from type=button to type=submit
          // inside its own click would let the browser submit the form.
          <Button key="next" type="button" size="lg" onClick={next}>
            {t("sell.step.next", "Continue")} · {STEPS[step + 1].label} <ArrowRight aria-hidden />
          </Button>
        ) : (
          <Button key="publish" type="submit" size="lg" disabled={!canSubmit && !submitting && !successFlash} loading={submitting && !successFlash}>
            {successFlash ? (
              <>
                <Check aria-hidden /> {t("sell.published", "Published!")}
              </>
            ) : (
              <>
                {t("sell.submitCta", "Publish listing")} <ArrowRight aria-hidden />
              </>
            )}
          </Button>
        )}
        <p className="text-caption text-label-2 sm:ml-1" aria-live="polite">
          {photosBusy
            ? t("sell.photos.pending", "Hold on — your photos are still uploading.")
            : photosFailed
              ? t("sell.photos.fixFailed", "Retry or remove the photos that didn't upload.")
              : step === last
                ? t("sell.reviewNote", "Listings go live after a quick review — usually within a few hours.")
                : null}
        </p>
      </div>
    </form>
  );

  return (
    <div className="bg-background pb-24 lg:pb-20">
      <CineHeader
        eyebrow={t("sell.eyebrow", "Sell your car")}
        lead={t("sell.cine.lead", "Your car,")}
        accent={t("sell.cine.accent", "in its best light.")}
        body={t("sell.subtitle", "Reach thousands of buyers searching the Sri Lankan market. Free to list — your ad goes live after a quick review.")}
        image={visuals.authShowroom}
        imagePosition="46% 58%"
      />
      <div ref={flowTop} className="mx-auto max-w-[1320px] scroll-mt-[calc(var(--nav-offset)+12px)] px-5 pt-8 sm:px-6 lg:pt-10">
        {done ? (
          <Card className="mx-auto max-w-xl">
            <EmptyState
              icon={CheckCircle2}
              title={t("sell.doneTitle", "Listing submitted!")}
              body={t("sell.doneBody", "Your vehicle is queued for review. We'll publish it to the market shortly.")}
              action={
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button asChild>
                    <Link to="/">
                      {t("sell.backToMarket", "Back to market")} <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setForm(INITIAL);
                      photos.reset();
                      setStep(0);
                      setDone(false);
                    }}
                  >
                    {t("sell.listAnother", "List another vehicle")}
                  </Button>
                </div>
              }
              hint={
                <Link to="/profile" className="font-semibold text-primary underline-offset-2 hover:underline">
                  {t("sell.manageListings", "Manage your listings")}
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] lg:gap-8">
            <div className="min-w-0">{formView}</div>
            <aside className="hidden lg:sticky lg:top-[calc(var(--nav-offset)+16px)] lg:block">{adCard}</aside>
          </div>
        )}
      </div>
    </div>
  );
}
