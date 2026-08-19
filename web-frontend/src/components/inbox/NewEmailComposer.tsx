"use client";

import { useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { CloseCircle, Maximize4, Minus, Paperclip2, Send2, Trash } from "iconsax-react";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

type Signature = { id: string; name: string; html: string; plainText: string };
export type EmailOption = { channel: string; scope: "org" | "personal"; label: string };

export function NewEmailComposer({ enterpriseId, options, onClose }: { enterpriseId: string; options: EmailOption[]; onClose: () => void }) {
  const { user } = useAuth();
  const [to, setTo] = useState(""); const [cc, setCc] = useState(""); const [subject, setSubject] = useState("");
  const [body, setBody] = useState(""); const [bodyHtml, setBodyHtml] = useState(""); const [file, setFile] = useState<File | null>(null);
  const [signatures, setSignatures] = useState<Signature[]>([]); const [signatureId, setSignatureId] = useState("none");
  const [optionIndex, setOptionIndex] = useState(0); const [sending, setSending] = useState(false); const [error, setError] = useState("");
  const [minimized, setMinimized] = useState(false); const [maximized, setMaximized] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!user) return; getDoc(doc(db, "users", user.uid)).then((snap) => { const saved = (snap.data()?.email_signatures as Signature[] | undefined) ?? []; setSignatures(saved); setSignatureId(saved[0]?.id ?? "none"); }); }, [user]);
  const send = async () => {
    const option = options[optionIndex]; if (!option || !to.trim() || !subject.trim() || !body.trim() || sending) return;
    setSending(true); setError("");
    try {
      let attachment: Record<string, unknown> | undefined;
      if (file) {
        const prepared = await httpsCallable(functions, "prepareInboxAttachment")({ enterpriseId, fileName: file.name, contentType: file.type || "application/octet-stream", size: file.size });
        const upload = prepared.data as { uploadUrl: string; documentId: string; storagePath: string; fileName: string; contentType: string };
        const uploaded = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": upload.contentType }, body: file });
        if (!uploaded.ok) throw new Error("Attachment upload failed.");
        attachment = (await httpsCallable(functions, "finalizeInboxAttachment")({ enterpriseId, documentId: upload.documentId, storagePath: upload.storagePath, fileName: upload.fileName, contentType: upload.contentType })).data as Record<string, unknown>;
      }
      const signature = signatures.find((item) => item.id === signatureId);
      await httpsCallable(functions, "sendDirectEmail")({ enterpriseId, channel: option.channel, scope: option.scope, to: to.trim(), cc: cc.trim() || null, subject: subject.trim(), body: `${body.trim()}${signature ? `\n\n${signature.plainText}` : ""}`, bodyHtml: `${bodyHtml || body.replace(/\n/g, "<br>")}${signature ? `<br><div>${signature.html}</div>` : ""}`, attachment });
      onClose();
    } catch (e) { setError((e as Error).message || "Email could not be sent."); } finally { setSending(false); }
  };
  return <section role="dialog" aria-label="New email" className={`fixed z-[70] flex flex-col overflow-hidden border border-gray-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,.28)] ${maximized ? "inset-4 rounded-3xl md:left-[250px]" : minimized ? "bottom-4 right-4 h-14 w-[min(520px,calc(100vw-2rem))] rounded-2xl" : "bottom-4 right-4 h-[min(700px,calc(100vh-6rem))] w-[min(660px,calc(100vw-2rem))] rounded-3xl"}`}>
    <header onClick={() => minimized && setMinimized(false)} className="flex h-14 shrink-0 cursor-pointer items-center gap-2 bg-[#f2f6ff] px-5 text-[#112d60]"><h2 className="min-w-0 flex-1 truncate text-base font-bold">New email</h2><button onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }} className="rounded-full p-2 hover:bg-white"><Minus size={18}/></button><button onClick={(e) => { e.stopPropagation(); setMaximized(!maximized); setMinimized(false); }} className="rounded-full p-2 hover:bg-white"><Maximize4 size={18}/></button><button onClick={onClose} className="rounded-full p-2 hover:bg-white"><CloseCircle size={20}/></button></header>
    {!minimized && <><div className="shrink-0 border-b border-gray-100 px-6 text-sm"><label className="flex min-h-12 items-center border-b"><span className="w-20 text-gray-400">From</span><select value={optionIndex} onChange={(e) => setOptionIndex(Number(e.target.value))} className="flex-1 bg-transparent outline-none">{options.map((o, i) => <option key={`${o.channel}-${o.scope}`} value={i}>{o.label}</option>)}</select></label><label className="flex min-h-12 items-center border-b"><span className="w-20 text-gray-400">To</span><input value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 outline-none" placeholder="name@example.com"/></label><label className="flex min-h-12 items-center border-b"><span className="w-20 text-gray-400">CC</span><input value={cc} onChange={(e) => setCc(e.target.value)} className="flex-1 outline-none" placeholder="Optional"/></label><label className="flex min-h-12 items-center"><span className="w-20 text-gray-400">Subject</span><input value={subject} onChange={(e) => setSubject(e.target.value)} className="flex-1 outline-none"/></label></div>
    <div className="flex min-h-0 flex-1 flex-col px-6 py-5">{error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-xs text-red-600">{error}</p>}<div contentEditable suppressContentEditableWarning data-placeholder="Write your email…" onInput={(e) => { setBody(e.currentTarget.innerText); setBodyHtml(e.currentTarget.innerHTML); }} className="min-h-40 flex-1 overflow-y-auto text-sm leading-7 outline-none empty:before:text-gray-300 empty:before:content-[attr(data-placeholder)]"/>{file && <div className="mb-3 flex items-center gap-2 rounded-xl bg-purple-50 p-3 text-xs"><Paperclip2 size={16}/><span className="min-w-0 flex-1 truncate">{file.name}</span><button onClick={() => setFile(null)}><Trash size={15}/></button></div>}{signatureId !== "none" && <div className="border-t pt-3 text-sm text-gray-500" dangerouslySetInnerHTML={{ __html: signatures.find((s) => s.id === signatureId)?.html ?? "" }}/>}</div>
    <footer className="flex items-center gap-2 border-t px-6 pb-6 pt-4"><button onClick={send} disabled={sending || !to.trim() || !subject.trim() || !body.trim() || !options.length} className="flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40">{sending ? "Sending…" : <>Send <Send2 size={16} color="#fff" variant="Bold"/></>}</button><input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)}/><button onClick={() => fileRef.current?.click()} className="rounded-full p-3 hover:bg-gray-100"><Paperclip2 size={20}/></button><select value={signatureId} onChange={(e) => setSignatureId(e.target.value)} className="rounded-full border px-3 py-2 text-xs"><option value="none">No signature</option>{signatures.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></footer></>}
  </section>;
}
