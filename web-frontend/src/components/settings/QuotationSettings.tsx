"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Lock1, DocumentUpload } from "iconsax-react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useEnterpriseId } from "@/lib/use-enterprise";

type Branding = {
  company_name?: string;
  tin?: string;
  address?: string;
  phones?: string;
  email?: string;
  website?: string;
  prepared_by?: string;
  vat_rate?: number;
  review_link?: string;
  terms?: string;
  proforma_prefix?: string;
  proforma_seq?: number;
  logo_url?: string;
  zoho_mail_merge_template?: string;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function QuotationSettings() {
  const { user } = useAuth();
  const { enterpriseId, loading: idLoading } = useEnterpriseId();
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<Branding>({});
  const [proformaStart, setProformaStart] = useState<string>("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      setIsOwner((snap.data()?.role as string) === "owner");
    });
  }, [user]);

  useEffect(() => {
    if (!enterpriseId) return;
    getDoc(doc(db, "quotation_settings", enterpriseId)).then((snap) => {
      const d = (snap.data() as Branding) || {};
      setForm(d);
      if (d.logo_url) setLogoPreview(d.logo_url);
      setLoading(false);
    });
  }, [enterpriseId]);

  const set = (k: keyof Branding, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  const onLogoPick = () => logoRef.current?.click();
  const onLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
    setSaved(false);
  };

  const save = async () => {
    if (!enterpriseId || !isOwner) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        enterpriseId,
        company_name: form.company_name ?? "",
        tin: form.tin ?? "",
        address: form.address ?? "",
        phones: form.phones ?? "",
        email: form.email ?? "",
        website: form.website ?? "",
        prepared_by: form.prepared_by ?? "",
        vat_rate: form.vat_rate ?? 18,
        review_link: form.review_link ?? "",
        terms: form.terms ?? "",
        proforma_prefix: form.proforma_prefix ?? "MCL",
        zoho_mail_merge_template: form.zoho_mail_merge_template ?? "",
      };
      if (proformaStart.trim()) payload.proforma_start = Number(proformaStart);
      if (logoFile) {
        payload.logoBase64 = await fileToBase64(logoFile);
        payload.logoType = logoFile.type || "image/png";
        payload.logoName = logoFile.name;
      }
      await httpsCallable(functions, "saveQuotationBranding")(payload);
      setSaved(true);
      setLogoFile(null);
    } catch (e) {
      setError((e as Error).message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50 disabled:text-gray-400";

  if (idLoading || loading) {
    return <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)] text-sm text-gray-400">Loading…</div>;
  }

  const disabled = !isOwner;

  return (
    <div className="space-y-5">
      {!isOwner && (
        <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">
          <Lock1 size={16} variant="Bold" color="#9ca3af" />
          Only the organization owner can edit quotation branding.
        </div>
      )}

      {/* Letterhead */}
      <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <h3 className="text-lg font-bold mb-1">Letterhead</h3>
        <p className="text-sm text-gray-400 mb-5">Appears at the top of every generated proforma / quotation.</p>

        {/* Logo */}
        <div className="flex items-center gap-4 mb-5">
          <div className="w-32 h-20 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="Quotation logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[11px] text-gray-400">No logo</span>
            )}
          </div>
          <div>
            <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogoChange} className="hidden" />
            <button
              onClick={onLogoPick}
              disabled={disabled}
              className="flex items-center gap-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-full px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
            >
              <DocumentUpload size={17} variant="Linear" color="#374151" />
              {logoPreview ? "Change logo" : "Upload logo"}
            </button>
            <p className="text-[11px] text-gray-400 mt-1.5">PNG with transparent background recommended.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-500 block mb-1">Company name</label>
            <input value={form.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} disabled={disabled} className={inputClass} placeholder="MERCURY COMPUTERS LTD" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">TIN No.</label>
            <input value={form.tin ?? ""} onChange={(e) => set("tin", e.target.value)} disabled={disabled} className={inputClass} placeholder="1000031307" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Phone(s)</label>
            <input value={form.phones ?? ""} onChange={(e) => set("phones", e.target.value)} disabled={disabled} className={inputClass} placeholder="0414256136, 0414347229" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-500 block mb-1">Address</label>
            <input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} disabled={disabled} className={inputClass} placeholder="Plot 91, Kamwokya, Kira Road, Kampala, Uganda" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Email</label>
            <input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} disabled={disabled} className={inputClass} placeholder="evelyn@mercurycomputerslimited.com" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Website</label>
            <input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} disabled={disabled} className={inputClass} placeholder="mercurycomputerslimited.com" />
          </div>
        </div>
      </div>

      {/* Invoice defaults */}
      <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <h3 className="text-lg font-bold mb-1">Zoho quotation document</h3>
        <p className="text-sm text-gray-400 mb-5">Ellipse uses this Zoho CRM mail-merge template to generate the official Quote PDF.</p>
        <label className="text-xs font-medium text-gray-500 block mb-1">Quote mail-merge template name</label>
        <input value={form.zoho_mail_merge_template ?? ""} onChange={(e) => set("zoho_mail_merge_template", e.target.value)} disabled={disabled} className={inputClass} placeholder="Official Quotation" />
        <p className="text-[11px] text-gray-400 mt-1.5">Enter the exact template name configured for the Quotes module in Zoho CRM.</p>
      </div>

      {/* Invoice defaults */}
      <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <h3 className="text-lg font-bold mb-5">Invoice defaults</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Proforma prefix</label>
            <input value={form.proforma_prefix ?? ""} onChange={(e) => set("proforma_prefix", e.target.value)} disabled={disabled} className={inputClass} placeholder="MCL" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">
              Next number {typeof form.proforma_seq === "number" ? `(currently ${form.proforma_seq})` : ""}
            </label>
            <input value={proformaStart} onChange={(e) => setProformaStart(e.target.value)} disabled={disabled} className={inputClass} placeholder="4800" inputMode="numeric" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">VAT rate (%)</label>
            <input value={form.vat_rate ?? ""} onChange={(e) => set("vat_rate", e.target.value)} disabled={disabled} className={inputClass} placeholder="18" inputMode="numeric" />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs font-medium text-gray-500 block mb-1">Prepared by (default)</label>
            <input value={form.prepared_by ?? ""} onChange={(e) => set("prepared_by", e.target.value)} disabled={disabled} className={inputClass} placeholder="EVELYN .N MUGISHA" />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs font-medium text-gray-500 block mb-1">Review link</label>
            <input value={form.review_link ?? ""} onChange={(e) => set("review_link", e.target.value)} disabled={disabled} className={inputClass} placeholder="https://g.page/r/…/review" />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs font-medium text-gray-500 block mb-1">Terms &amp; conditions (one per line)</label>
            <textarea value={form.terms ?? ""} onChange={(e) => set("terms", e.target.value)} disabled={disabled} rows={4} className={`${inputClass} resize-y`} placeholder={"Validity: 7 Days from Proforma Date\nDelivery Period: Immediate - After LPO\nPayment: Cash / Cheque / EFT"} />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">{error}</p>}

      {isOwner && (
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="bg-black text-white text-sm font-medium rounded-full px-6 py-2.5 hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save branding"}
          </button>
          {saved && <span className="text-sm text-green-600">Saved.</span>}
        </div>
      )}
    </div>
  );
}
