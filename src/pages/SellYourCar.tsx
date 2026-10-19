import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Camera, CheckCircle2, Loader2, MapPin, Phone, Tag, User } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useAppPreferences } from "@/lib/appPreferences";
import { createMyListing, type MyListingInput } from "@/services/api";
import { trackEvent } from "@/lib/analytics";
import { PageCanvas } from "@/components/PageCanvas";
import { PageHero } from "@/components/PageHero";
import { Button } from "@/components/ui/button";
import { MovingBorder } from "@/components/ui/MovingBorder";
import { StatefulButton, type StatefulButtonState } from "@/components/ui/StatefulButton";
import { Input } from "@/components/ui/input";

const MAKES = [
  "Toyota", "Suzuki", "Honda", "Nissan", "Mitsubishi", "Mazda",
  "Hyundai", "Kia", "BMW", "Mercedes-Benz", "Audi", "Perodua",
  "Micro", "DFSK", "Chery", "BYD", "MG", "Other",
];
const FUEL_TYPES = ["Petrol", "Diesel", "Hybrid", "Electric", "CNG"];
const TRANSMISSIONS = ["Automatic", "Manual", "CVT"];
const CONDITIONS = ["Used", "Reconditioned", "Brand New"];
const CATEGORIES = [
  { key: "cars", label: "Car" },
  { key: "bikes", label: "Bike" },
  { key: "tuk", label: "Tuk" },
  { key: "van", label: "Van" },
  { key: "suv", label: "SUV" },
];
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
  imageUrls: string[];
};

const INITIAL: FormState = {
  make: "", model: "", year: "", priceLkr: "", mileage: "",
  fuelType: "Petrol", transmission: "Automatic", condition: "Used",
  bodyType: "", vehicleCategory: "cars", district: "", city: "",
  title: "", description: "", contactName: "", contactPhone: "",
  imageUrls: [],
};

const currentYear = new Date().getFullYear();

export default function SellYourCar() {
  const { t } = useAppPreferences();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [imageUrl, setImageUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successFlash, setSuccessFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (user?.email) {
      setForm((f) => (f.contactName ? f : { ...f, contactName: user.name || "" }));
    }
  }, [user]);

  const setField = useCallback((key: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  }, []);

  const addImage = useCallback(() => {
    const url = imageUrl.trim();
    if (!url || form.imageUrls.length >= 12) return;
    if (!/^https?:\/\//i.test(url)) {
      setError(t("sell.imageUrlInvalid", "Image must be a valid http(s) URL."));
      return;
    }
    setForm((f) => ({ ...f, imageUrls: [...f.imageUrls, url] }));
    setImageUrl("");
    setError(null);
  }, [imageUrl, form.imageUrls.length, t]);

  const removeImage = useCallback((idx: number) => {
    setForm((f) => ({ ...f, imageUrls: f.imageUrls.filter((_, i) => i !== idx) }));
  }, []);

  const canSubmit = useMemo(
    () =>
      form.make.trim() &&
      form.model.trim() &&
      form.contactPhone.trim() &&
      !submitting &&
      isAuthenticated,
    [form.make, form.model, form.contactPhone, submitting, isAuthenticated],
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
          imageUrls: form.imageUrls,
        };
        await createMyListing(payload);
        trackEvent("sell_listing_created", {
          make: payload.make,
          model: payload.model,
          vehicleCategory: payload.vehicleCategory,
          hasPrice: Boolean(payload.priceLkr),
          imageCount: payload.imageUrls?.length ?? 0,
        });
        // Let the button celebrate the publish before the form swaps out (#10 UI review).
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
    [canSubmit, form, isAuthenticated, t],
  );

  return (
    <PageCanvas>
      <PageHero
        eyebrow={t("sell.eyebrow", "Sell your car")}
        title={t("sell.title", "List your vehicle on Motormila")}
        description={t(
          "sell.subtitle",
          "Reach thousands of buyers searching the Sri Lankan market. Free to list — your ad goes live after a quick review.",
        )}
      />

      {done ? (
        <section className="mx-auto max-w-xl px-5 py-16 text-center">
          <div className="liquid-panel rounded-[2rem] p-10">
            <CheckCircle2 className="mx-auto h-14 w-14 text-primary-bright" aria-hidden />
            <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight text-foreground">
              {t("sell.doneTitle", "Listing submitted!")}
            </h2>
            <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
              {t(
                "sell.doneBody",
                "Your vehicle is queued for review. We'll publish it to the market shortly.",
              )}{" "}
              <button
                type="button"
                onClick={() => navigate("/profile")}
                className="font-semibold text-primary-bright underline-offset-2 hover:underline"
              >
                {t("sell.manageListings", "Manage your listings")}
              </button>
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => navigate("/")} variant="default">
                {t("sell.backToMarket", "Back to market")}
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setForm(INITIAL);
                  setDone(false);
                }}
              >
                {t("sell.listAnother", "List another vehicle")}
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-3xl px-5 pb-20">
          {!isAuthenticated && (
            <div className="liquid-panel mb-6 rounded-2xl border border-primary/25 bg-primary/5 px-5 py-4">
              <p className="text-[13px] leading-relaxed text-foreground">
                {t("sell.signInNotice", "You need to sign in to publish a listing.")}{" "}
                <button
                  type="button"
                  onClick={() => navigate("/sign-in")}
                  className="font-semibold text-primary-bright underline-offset-2 hover:underline"
                >
                  {t("sell.signInCta", "Sign in")}
                </button>
              </p>
            </div>
          )}

          <form onSubmit={onSubmit} className="liquid-panel space-y-8 rounded-[2rem] p-6 sm:p-9">
            {error && (
              <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-200">
                {error}
              </div>
            )}

            {/* Vehicle identity */}
            <fieldset className="space-y-4">
              <legend className="tech-label flex items-center gap-2 text-muted-foreground">
                <Tag className="h-3.5 w-3.5" aria-hidden />
                {t("sell.sectionVehicle", "Vehicle details")}
              </legend>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-caption font-medium text-foreground">
                    {t("sell.make", "Make")} *
                  </span>
                  <select
                    required
                    value={form.make}
                    onChange={(e) => setField("make", e.target.value)}
                    className="h-11 w-full rounded-full border border-border/50 bg-surface/70 px-4 text-sm text-foreground focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">{t("sell.selectMake", "Select make")}</option>
                    {MAKES.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-caption font-medium text-foreground">
                    {t("sell.model", "Model")} *
                  </span>
                  <Input
                    required
                    value={form.model}
                    onChange={(e) => setField("model", e.target.value)}
                    placeholder={t("sell.modelPh", "e.g. Axio, Vitz, Hilux")}
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-caption font-medium text-foreground">
                    {t("sell.year", "Year")}
                  </span>
                  <select
                    value={form.year}
                    onChange={(e) => setField("year", e.target.value)}
                    className="h-11 w-full rounded-full border border-border/50 bg-surface/70 px-4 text-sm text-foreground"
                  >
                    <option value="">{t("sell.selectYear", "Select year")}</option>
                    {Array.from({ length: 40 }, (_, i) => currentYear - i).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-caption font-medium text-foreground">
                    {t("sell.price", "Price (LKR)")}
                  </span>
                  <Input
                    type="number"
                    min="0"
                    value={form.priceLkr}
                    onChange={(e) => setField("priceLkr", e.target.value)}
                    placeholder="e.g. 5500000"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-caption font-medium text-foreground">
                    {t("sell.mileage", "Mileage (km)")}
                  </span>
                  <Input
                    type="number"
                    min="0"
                    value={form.mileage}
                    onChange={(e) => setField("mileage", e.target.value)}
                    placeholder="e.g. 85000"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-caption font-medium text-foreground">{t("sell.fuel", "Fuel type")}</span>
                  <select
                    value={form.fuelType}
                    onChange={(e) => setField("fuelType", e.target.value)}
                    className="h-11 w-full rounded-full border border-border/50 bg-surface/70 px-4 text-sm text-foreground"
                  >
                    {FUEL_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-caption font-medium text-foreground">{t("sell.transmission", "Transmission")}</span>
                  <select
                    value={form.transmission}
                    onChange={(e) => setField("transmission", e.target.value)}
                    className="h-11 w-full rounded-full border border-border/50 bg-surface/70 px-4 text-sm text-foreground"
                  >
                    {TRANSMISSIONS.map((tm) => <option key={tm} value={tm}>{tm}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-caption font-medium text-foreground">{t("sell.condition", "Condition")}</span>
                  <select
                    value={form.condition}
                    onChange={(e) => setField("condition", e.target.value)}
                    className="h-11 w-full rounded-full border border-border/50 bg-surface/70 px-4 text-sm text-foreground"
                  >
                    {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setField("vehicleCategory", c.key)}
                    className={`rounded-full border px-3 py-1 text-caption font-medium transition-all active:scale-[0.97] ${
                      form.vehicleCategory === c.key
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border/50 bg-surface/70 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Location */}
            <fieldset className="space-y-4">
              <legend className="tech-label flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {t("sell.sectionLocation", "Location")}
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-caption font-medium text-foreground">{t("sell.district", "District")}</span>
                  <select
                    value={form.district}
                    onChange={(e) => setField("district", e.target.value)}
                    className="h-11 w-full rounded-full border border-border/50 bg-surface/70 px-4 text-sm text-foreground"
                  >
                    <option value="">{t("sell.selectDistrict", "Select district")}</option>
                    {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-caption font-medium text-foreground">{t("sell.city", "City")}</span>
                  <Input
                    value={form.city}
                    onChange={(e) => setField("city", e.target.value)}
                    placeholder={t("sell.cityPh", "e.g. Dehiwala")}
                  />
                </label>
              </div>
            </fieldset>

            {/* Photos */}
            <fieldset className="space-y-4">
              <legend className="tech-label flex items-center gap-2 text-muted-foreground">
                <Camera className="h-3.5 w-3.5" aria-hidden />
                {t("sell.sectionPhotos", "Photos")}
              </legend>
              <div className="flex gap-2">
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder={t("sell.imageUrlPh", "Paste an image URL (https://…)")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addImage(); }
                  }}
                />
                <Button type="button" variant="outline" onClick={addImage} disabled={form.imageUrls.length >= 12}>
                  {t("sell.addImage", "Add")}
                </Button>
              </div>
              <p className="text-caption text-muted-foreground">
                {t("sell.imageHint", "Add up to 12 photos. Hosted on any public image URL — the first becomes your cover.")}
              </p>
              {form.imageUrls.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {form.imageUrls.map((u, i) => (
                    <div key={u + i} className="group relative overflow-hidden rounded-2xl border border-border/50 aspect-[4/3]">
                      <img src={u} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        {t("sell.remove", "Remove")}
                      </button>
                      {i === 0 && (
                        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold text-primary-foreground">
                          {t("sell.cover", "Cover")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </fieldset>

            {/* Description */}
            <fieldset className="space-y-4">
              <legend className="tech-label text-muted-foreground">{t("sell.sectionDesc", "Description")}</legend>
              <label className="block">
                <span className="mb-1.5 block text-caption font-medium text-foreground">{t("sell.listingTitle", "Listing title")}</span>
                <Input
                  value={form.title}
                  onChange={(e) => setField("title", e.target.value)}
                  placeholder={t("sell.titlePh", "e.g. 2018 Toyota Axio — well maintained, one owner")}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-caption font-medium text-foreground">{t("sell.description", "Details")}</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  rows={5}
                  maxLength={4000}
                  placeholder={t(
                    "sell.descPh",
                    "Service history, condition, why you're selling, accessories, anything buyers should know…",
                  )}
                  className="w-full rounded-3xl border border-border/50 bg-surface/70 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20"
                />
              </label>
            </fieldset>

            {/* Contact */}
            <fieldset className="space-y-4">
              <legend className="tech-label flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                {t("sell.sectionContact", "Contact")}
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1 text-caption font-medium text-foreground">
                    <User className="h-3 w-3" aria-hidden />
                    {t("sell.contactName", "Your name")}
                  </span>
                  <Input
                    value={form.contactName}
                    onChange={(e) => setField("contactName", e.target.value)}
                    placeholder={t("sell.contactNamePh", "Name shown to buyers")}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-caption font-medium text-foreground">
                    {t("sell.contactPhone", "Phone number")} *
                  </span>
                  <Input
                    required
                    value={form.contactPhone}
                    onChange={(e) => setField("contactPhone", e.target.value)}
                    placeholder="07X XXX XXXX"
                  />
                </label>
              </div>
              <p className="text-caption text-muted-foreground">
                {t("sell.contactHint", "Your phone is shown to signed-in buyers so they can contact you directly.")}
              </p>
            </fieldset>

            <div className="flex flex-wrap items-center gap-3 border-t border-border/40 pt-6">
              {/* Moving Border + Stateful Button (#10 UI review) */}
              <MovingBorder radius="0.625rem">
                <StatefulButton
                  type="submit"
                  disabled={!canSubmit}
                  size="lg"
                  state={(successFlash ? "success" : submitting ? "loading" : "idle") satisfies StatefulButtonState}
                  idle={
                    <>
                      {t("sell.submitCta", "Publish listing")}
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                    </>
                  }
                  loading={
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      {t("sell.submitting", "Publishing…")}
                    </>
                  }
                  success={
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
                      {t("sell.published", "Published!")}
                    </>
                  }
                />
              </MovingBorder>
              <p className="text-caption text-muted-foreground">
                {t("sell.reviewNote", "Listings go live after a quick review — usually within a few hours.")}
              </p>
            </div>
          </form>
        </section>
      )}
    </PageCanvas>
  );
}
