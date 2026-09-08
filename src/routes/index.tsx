import { createFileRoute } from "@tanstack/react-router";
import { Download, LogOut, Share2, Upload, X } from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { confirmUser, getCurrentToken, signIn, signOut, signUp } from "@/lib/securedrive-auth";

const API_URL =
  (import.meta.env["VITE_API_URL"] as string | undefined) ??
  "https://55rkubu5j7.execute-api.ap-southeast-2.amazonaws.com";

interface FileItem {
  PK: string;
  SK: string;
  filename: string;
  size_bytes: number;
  owner_sub?: string;
  GSI1SK?: string;
}

type AuthStep = "login" | "signup" | "confirm";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SecureDrive | Private File Vault" },
      { name: "description", content: "Sign in to upload, share, and download your private files with SecureDrive." },
      { property: "og:title", content: "SecureDrive | Private File Vault" },
      { property: "og:description", content: "A quiet, secure home for your files." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SecureDrive,
});

function VaultIllustration({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`vault-float relative grid place-items-center border border-ink bg-sun ${compact ? "h-36 w-40" : "h-[210px] w-[230px]"}`}>
      <span className="register-mark absolute left-2 top-2 opacity-60" />
      <span className="register-mark absolute bottom-2 right-2 opacity-60" />
      <span className="absolute -right-3 top-7 h-8 w-3 border-y border-r border-ink bg-coral" />
      <span className="absolute -left-3 bottom-9 h-6 w-3 border-y border-l border-ink bg-tide" />
      <svg viewBox="0 0 210 190" className={compact ? "h-28 w-32" : "h-[150px] w-[170px]"} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Hand-drawn vault">
        <path className="vault-draw" d="M35 45 H175 V150 H35 Z" />
        <circle className="vault-draw" cx="105" cy="97" r="34" />
        <circle className="vault-draw opacity-40" cx="105" cy="97" r="42" strokeDasharray="2 7" />
        <circle className="vault-draw" cx="105" cy="97" r="16" />
        <path className="vault-draw" d="M105 63 V81 M139 97 H121 M105 131 V113 M71 97 H89" />
        <path className="vault-draw" d="M35 62 H175 M35 133 H175" />
        <path className="vault-draw" d="M175 97 H192 M192 97 a9 9 0 1 0 9 9 M192 97 a9 9 0 1 1 9 9" />
      </svg>
    </div>
  );
}

function SecureDrive() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [authStep, setAuthStep] = useState<AuthStep>("login");
  const [files, setFiles] = useState<{ owned: FileItem[]; sharedWithMe: FileItem[] }>({ owned: [], sharedWithMe: [] });
  const [status, setStatus] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [activeShareId, setActiveShareId] = useState<string | null>(null);

  const fetchFiles = async (jwt: string) => {
    try {
      const response = await fetch(`${API_URL}/files`, { headers: { Authorization: jwt } });
      const data = (await response.json()) as { owned?: FileItem[]; sharedWithMe?: FileItem[] };
      setFiles({ owned: data.owned ?? [], sharedWithMe: data.sharedWithMe ?? [] });
    } catch {
      setStatus("Failed to fetch files");
    }
  };

  useEffect(() => {
    void getCurrentToken().then((currentToken) => {
      if (!currentToken) return;
      setToken(currentToken);
      void fetchFiles(currentToken);
    });
  }, []);

  const handleAuth = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");
    try {
      if (authStep === "signup") {
        await signUp(email, password);
        setAuthStep("confirm");
        setStatus("Verification code sent to your email.");
      } else if (authStep === "confirm") {
        await confirmUser(email, code);
        setAuthStep("login");
        setStatus("Email confirmed. Please sign in.");
      } else {
        const jwt = await signIn(email, password);
        setToken(jwt);
        void fetchFiles(jwt);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Authentication failed");
    }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;
    setStatus("Requesting upload link...");
    try {
      const initResponse = await fetch(`${API_URL}/upload-url`, {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream" }),
      });
      if (!initResponse.ok) throw new Error(`API Gateway error: ${await initResponse.text()}`);
      const { uploadUrl } = (await initResponse.json()) as { uploadUrl: string };
      setStatus("Uploading directly to S3...");
      const uploadResponse = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      if (!uploadResponse.ok) throw new Error(`S3 Error (${uploadResponse.status}): ${await uploadResponse.text()}`);
      setStatus("Upload complete. Processing file...");
      window.setTimeout(() => void fetchFiles(token), 3000);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload error");
    } finally {
      event.target.value = "";
    }
  };

  const handleDownload = async (fileId: string, owner?: string) => {
    if (!token) return;
    setStatus("Fetching download link...");
    try {
      const response = await fetch(`${API_URL}/files/${fileId}/download${owner ? `?owner=${owner}` : ""}`, { headers: { Authorization: token } });
      if (!response.ok) throw new Error(`Download failed (${response.status}): ${await response.text()}`);
      const data = (await response.json()) as { downloadUrl: string; filename?: string };
      const link = document.createElement("a");
      link.href = data.downloadUrl;
      link.download = data.filename ?? "download";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus("Download started.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to get download URL");
    }
  };

  const handleShare = async (fileId: string) => {
    if (!token) return;
    setStatus("Sharing file...");
    try {
      const response = await fetch(`${API_URL}/files/${fileId}/share`, { method: "POST", headers: { Authorization: token, "Content-Type": "application/json" }, body: JSON.stringify({ targetEmail: shareEmail }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Sharing failed");
      setStatus(`Shared successfully with ${shareEmail}`);
      setActiveShareId(null);
      setShareEmail("");
      void fetchFiles(token);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sharing error");
    }
  };

  if (!token) {
    return (
      <main className="paper-grid min-h-screen px-5 py-8 text-ink sm:px-8">
        <header className="mx-auto flex max-w-6xl items-center justify-between border-b-2 border-ink pb-4">
          <div className="flex items-center gap-3"><span className="register-mark" /><span className="font-serif text-lg">SecureDrive</span></div>
          <span className="text-xs uppercase tracking-[0.16em] text-ink/55">Private ledger</span>
        </header>
        <div className="soft-enter mx-auto grid max-w-6xl gap-12 py-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-20">
          <div className="relative flex justify-center lg:justify-start">
            <div className="relative">
              <VaultIllustration />
              <span className="absolute -right-16 top-4 hidden h-px w-14 bg-ink/25 lg:block" />
              <span className="absolute -right-20 top-2 hidden text-[9px] uppercase text-ink/40 lg:block">01</span>
              <div className="absolute -bottom-10 left-8 flex items-center gap-3" aria-hidden="true">
                <span className="h-1.5 w-14 bg-coral" />
                <span className="size-1.5 rounded-full bg-moss" />
                <span className="h-1.5 w-8 bg-tide" />
              </div>
            </div>
          </div>
          <section className="max-w-xl">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-ink/60"><span className="register-mark" /> Private file storage</div>
            <h1 className="mt-4 font-serif text-5xl leading-[1.03] sm:text-6xl">Storage, simplified.</h1>
            <p className="mt-5 max-w-[40ch] text-[15px] leading-relaxed text-ink/70">Keep your files private, organized, and close at hand.</p>
            <form onSubmit={handleAuth} className="mt-9 border-t-2 border-ink pt-5">
              <div className="mb-5 flex items-baseline justify-between"><h2 className="font-serif text-2xl">{authStep === "login" ? "Sign in" : authStep === "signup" ? "Open your vault" : "Verify your email"}</h2><span className="text-[11px] uppercase tracking-[0.15em] text-ink/50">Secure entry</span></div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.14em]">Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="mt-2 w-full border-2 border-ink bg-paper px-3 py-3 text-sm outline-none focus:border-tide" /></label>
              {authStep === "confirm" ? (
                <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.14em]">Verification code<input value={code} onChange={(event) => setCode(event.target.value)} required className="mt-2 w-full border-2 border-ink bg-paper px-3 py-3 text-sm outline-none focus:border-tide" /></label>
              ) : (
                <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.14em]">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required className="mt-2 w-full border-2 border-ink bg-paper px-3 py-3 text-sm outline-none focus:border-tide" /></label>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button type="submit" className="h-11 px-6 uppercase tracking-[0.14em]">{authStep === "login" ? "Unlock vault" : authStep === "signup" ? "Create account" : "Verify code"}</Button>
                <Button type="button" variant="ledger" className="h-11 px-5 text-xs uppercase tracking-[0.12em]" onClick={() => { setAuthStep(authStep === "login" ? "signup" : "login"); setStatus(""); }}>{authStep === "login" ? "Create account" : "Back to sign in"}</Button>
              </div>
              {status && <p role="status" className="file-slip mt-5 border-2 border-ink bg-sun px-4 py-3 text-sm font-medium">{status}</p>}
            </form>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="paper-grid min-h-screen text-ink">
      <div className="mx-auto max-w-[1200px] px-5 pb-20 pt-7 sm:px-8 sm:pt-10">
        <header className="flex items-center justify-between border-b-2 border-ink pb-4">
          <div className="flex items-center gap-3"><span className="register-mark shrink-0" /><span className="font-serif text-lg">SecureDrive</span><span className="hidden bg-tide px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-paper sm:inline">Authenticated</span></div>
          <Button variant="ledger" size="sm" aria-label="Sign out" onClick={() => { signOut(); setToken(null); }}><LogOut /> <span className="hidden sm:inline">Sign out</span></Button>
        </header>

        <section className="soft-enter mt-10 flex flex-col items-start gap-8 sm:mt-12 sm:flex-row sm:items-end sm:gap-12">
          <VaultIllustration compact />
          <div className="max-w-[46ch]"><div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-ink/60"><span className="register-mark" /> Your private storage</div><h1 className="mt-3 font-serif text-4xl leading-[1.04] sm:text-[3.4rem]">Your files, kept safe.</h1><p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-ink/70">Everything you store and everything shared with you, all in one place.</p></div>
        </section>

        <section className="mt-12 flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-serif text-2xl">Add a file</h2><p className="mt-1 text-xs text-ink/55">Choose a file to store securely.</p></div><label className="press inline-flex cursor-pointer items-center gap-2 border-2 border-ink bg-ink px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-paper"><Upload className="size-4" /> Upload file<input type="file" onChange={handleUpload} className="hidden" /></label></section>

        {status && <div role="status" className="file-slip mt-6 flex items-center gap-3 border-2 border-ink bg-sun px-4 py-3 text-sm font-medium"><span className="size-2.5 shrink-0 rounded-full bg-moss" />{status}</div>}

        <FileSection title="Owned" count={files.owned.length} accent="bg-coral">
          {files.owned.length === 0 ? <EmptyRow>No files uploaded yet.</EmptyRow> : files.owned.map((file) => { const fileId = file.SK.replace("FILE#", ""); return <FileRow key={file.SK} file={file} onDownload={() => void handleDownload(fileId)} onShare={() => setActiveShareId(activeShareId === fileId ? null : fileId)} />; })}
        </FileSection>

        {activeShareId && <section className="soft-enter mt-8 border-2 border-ink bg-paper p-5"><div className="flex items-center gap-3"><span className="bg-coral px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-paper">Sharing</span><span className="font-serif text-lg">Invite a reader by email</span><Button variant="ghost" size="icon" className="ml-auto" aria-label="Close sharing form" onClick={() => setActiveShareId(null)}><X /></Button></div><div className="mt-4 flex flex-wrap gap-3"><input type="email" placeholder="reader@example.com" value={shareEmail} onChange={(event) => setShareEmail(event.target.value)} className="min-w-0 flex-1 border-2 border-ink bg-paper px-3 py-2 text-sm outline-none focus:border-tide" /><Button onClick={() => void handleShare(activeShareId)}>Send link</Button><Button variant="ledger" onClick={() => setActiveShareId(null)}>Cancel</Button></div></section>}

        <FileSection title="Shared with you" count={files.sharedWithMe.length} accent="bg-tide">
          {files.sharedWithMe.length === 0 ? <EmptyRow>No incoming shares.</EmptyRow> : files.sharedWithMe.map((file) => { const fileId = file.GSI1SK ? file.GSI1SK.replace("FILE#", "") : file.SK.replace(/.*#/, ""); const owner = file.owner_sub ?? file.PK.replace("USER#", ""); return <FileRow key={`${file.PK}-${file.SK}`} file={file} detail={`From ${owner.slice(0, 8)}…`} onDownload={() => void handleDownload(fileId, owner)} />; })}
        </FileSection>

        <footer className="mt-14 flex items-center justify-between border-t-2 border-ink pt-4 text-[11px] uppercase tracking-[0.16em] text-ink/55"><span>SecureDrive · Vault 04</span><span className="flex items-center gap-2"><span className="register-mark" /> Press OK</span></footer>
      </div>
    </main>
  );
}

function FileSection({ title, count, accent, children }: { title: string; count: number; accent: string; children: React.ReactNode }) {
  return <section className="mt-12"><div className="flex items-center gap-3"><span className={`size-3 shrink-0 rounded-full ${accent}`} /><h2 className="font-serif text-xl">{title}</h2><span className="text-xs text-ink/50">{count} {count === 1 ? "slip" : "slips"}</span><span className="h-px flex-1 border-t border-ink/25" /></div><div className="mt-4 border-t-2 border-ink">{children}</div></section>;
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-ink/20 py-8 text-center font-serif text-sm italic text-ink/50">{children}</div>;
}

function FileRow({ file, detail, onDownload, onShare }: { file: FileItem; detail?: string; onDownload: () => void; onShare?: () => void }) {
  return <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-ink/20 py-3 sm:grid-cols-[1fr_110px_auto]"><div className="min-w-0"><p className="truncate font-serif text-[15px]">{file.filename}</p><p className="mt-0.5 text-xs text-ink/50">{detail ?? `${(file.size_bytes / 1024).toFixed(1)} KB`}</p></div><span className="hidden items-center gap-2 text-xs sm:flex"><span className="size-2 rounded-full bg-moss" /> Sealed</span><div className="flex gap-2"><Button variant="ledger" size="icon" aria-label={`Download ${file.filename}`} title="Download" onClick={onDownload}><Download /></Button>{onShare && <Button variant="ledger" size="icon" aria-label={`Share ${file.filename}`} title="Share" onClick={onShare}><Share2 /></Button>}</div></div>;
}