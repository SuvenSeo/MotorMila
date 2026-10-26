import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Camera, Car, Check, CheckCircle2, Circle, FileText, ImageOff, LogIn, MapPin, Phone, Tag } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";
import { createMyListing, getUploadsConfig, requestUploadTicket, type MyListingInput } from "@/services/api";
import { usePhotoUploads } from "@/hooks/usePhotoUploads";
import { DEFAULT_MAX_BYTES, MAX_PHOTOS, doneUrls, hasFailures, isBusy } from "@/lib/photoUpload";
import { PhotoUploader } from "@/components/sell/PhotoUploader";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/ui/select";
import { AdornedInput, AnimatedLkr, ChoiceChips, Field, FormCard, Notice, ToolGrid, ToolPage } from "@/components/tools/ToolKit";

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

  /* ── Live ad preview (sticky on desktop) ──────────────────────────────── */
  const previewTitle =
    form.title.trim() || [form.year, form.make, form.model].filter(Boolean).join(" ") || t("tools.sell.previewEmpty", "Your vehicle");
  const cover = photos.items[0]?.previewUrl ?? undefined;
  const price = Number(form.priceLkr);
  const mileage = Number(form.mileage);
  const checks = [
    { done: Boolean(form.make && form.model.trim()), label: t("tools.sell.check.vehicle", "Make and model") },
    { done: Boolean(form.priceLkr), label: t("tools.sell.check.price", "Asking price") },
    { done: imageUrls.length > 0, label: t("tools.sell.check.photos", "At least one photo") },
    { done: Boolean(form.district), label: t("tools.sell.check.location", "District") },
    { done: Boolean(form.contactPhone.trim()), label: t("tools.sell.check.phone", "Phone number") },
  ];
  const completed = checks.filter((c) => c.done).length;

  /** Desktop only: on phones the form is the page and the preview would land under the publish button. */
  const preview = (
    <>
      <Card variant="media" padding="none" className="hidden lg:block" aria-label={t("tools.sell.preview", "Ad preview")}>
        <div className="relative aspect-[4/3] bg-surface-2">
          {cover && brokenCover !== cover ? (
            <img src={cover} alt="" className="content-in h-full w-full object-cover" onError={() => setBrokenCover(cover)} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-label-3">
              {cover ? <ImageOff className="h-8 w-8" strokeWidth={1.5} aria-hidden /> : <Car className="h-10 w-10" strokeWidth={1.25} aria-hidden />}
              <p className="text-footnote">{cover ? t("tools.sell.coverBroken", "This photo link doesn't load") : t("tools.sell.coverEmpty", "Your cover photo shows here")}</p>
            </div>
          )}
          <Badge variant="neutral" className="absolute left-3 top-3 border-transparent bg-background/90">
            {t("tools.sell.preview", "Ad preview")}
          </Badge>
        </div>
        <div className="p-5">
          <p className="truncate text-callout font-semibold text-foreground">{previewTitle}</p>
          <p className="mt-1 font-display text-title2 font-semibold text-foreground">
            {price > 0 ? <AnimatedLkr value={price} mode="full" /> : <span className="text-label-3">{t("tools.sell.noPrice", "Add a price")}</span>}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {mileage > 0 ? <Badge variant="neutral">{mileage.toLocaleString("en-US")} km</Badge> : null}
            <Badge variant="neutral">{form.fuelType}</Badge>
            <Badge variant="neutral">{form.transmission}</Badge>
            {form.district ? (
              <Badge variant="neutral">
                <MapPin aria-hidden /> {form.city ? `${form.city}, ${form.district}` : form.district}
              </Badge>
            ) : null}
          </div>
        </div>
      </Card>
      <Card padding="sm" className="hidden sm:p-5 lg:block">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-footnote font-semibold text-foreground">{t("tools.sell.checklist", "Ready to publish")}</p>
          <p className="text-footnote tabular-nums text-label-2">
            {completed} / {checks.length}
          </p>
        </div>
        <ul className="mt-3 space-y-2">
          {checks.map((c) => (
            <li key={c.label} className={cn("flex items-center gap-2 text-footnote transition-colors duration-short ease-standard", c.done ? "text-foreground" : "text-label-2")}>
              {c.done ? <CheckCircle2 className="h-4 w-4 text-deal-good-text" aria-hidden /> : <Circle className="h-4 w-4 text-label-3" aria-hidden />}
              {c.label}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );

  /* ── Form ─────────────────────────────────────────────────────────────── */
  const formView = (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
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
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("sell.year", "Year")} htmlFor="sell-year">
            <SimpleSelect
              id="sell-year"
              value={String(form.year)}
              onValueChange={(v) => setField("year", v)}
              placeholder={t("sell.selectYear", "Select year")}
              options={Array.from({ length: 40 }, (_, i) => currentYear - i).map((y) => ({ value: String(y), label: y }))}
            />
          </Field>
          <Field label={t("sell.price", "Price (LKR)")} htmlFor="sell-price">
            <AdornedInput id="sell-price" type="number" min="0" inputMode="numeric" prefix="Rs" value={form.priceLkr} onChange={(e) => setField("priceLkr", e.target.value)} placeholder="5500000" />
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

      <FormCard icon={FileText} title={t("sell.sectionDesc", "Description")}>
        <Field label={t("sell.listingTitle", "Listing title")} htmlFor="sell-title">
          <Input id="sell-title" value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder={t("sell.titlePh", "e.g. 2018 Toyota Axio — well maintained, one owner")} />
        </Field>
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

      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" disabled={!canSubmit && !submitting && !successFlash} loading={submitting && !successFlash}>
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
        <p className="text-caption text-label-2" aria-live="polite">
          {photosBusy
            ? t("sell.photos.pending", "Hold on — your photos are still uploading.")
            : photosFailed
              ? t("sell.photos.fixFailed", "Retry or remove the photos that didn't upload.")
              : t("sell.reviewNote", "Listings go live after a quick review — usually within a few hours.")}
        </p>
      </div>
    </form>
  );

  return (
    <ToolPage
      header={
        <PageHeader
          eyebrow={t("sell.eyebrow", "Sell your car")}
          eyebrowIcon={Tag}
          title={t("sell.title", "List your vehicle on Motormila")}
          description={t("sell.subtitle", "Reach thousands of buyers searching the Sri Lankan market. Free to list — your ad goes live after a quick review.")}
        />
      }
    >
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
        <ToolGrid form={formView} result={preview} />
      )}
    </ToolPage>
  );
}
