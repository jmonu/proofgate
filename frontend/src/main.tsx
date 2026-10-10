import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  Link,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ShieldCheck,
  LayoutDashboard,
  UserRound,
  Files,
  BadgeCheck,
  Globe2,
  History,
  Settings,
  LogOut,
  ArrowUpRight,
  ArrowRight,
  Plus,
  LockKeyhole,
  Check,
  ChevronRight,
  FileText,
  Upload,
  Download,
  Trash2,
  Eye,
  Shield,
  KeyRound,
  X,
  Menu,
  Mail,
  GraduationCap,
  Fingerprint,
  CheckCircle2,
} from "lucide-react";
import "./styles.css";
import { DobField } from "./DobField.js";
let csrf = "";
async function api(path: string, method = "GET", body?: unknown): Promise<any> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "include",
    headers: {
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { "X-CSRF-Token": csrf }),
    },
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.fields
        ? data.fields.map((f: any) => `${f.field}: ${f.message}`).join("; ")
        : data.error || "Request failed.",
    );
  return data;
}
type Session = {
  id: string;
  email: string;
  emailVerified: boolean;
  csrf: string;
  expiresAt: string;
  emailMode: string;
};
type AppState = {
  session: Session;
  refresh: () => Promise<void>;
  version: number;
  notify: (text: string, error?: boolean) => void;
};
const Context = createContext<AppState>(null!);
const useApp = () => useContext(Context);
const icons = [
  LayoutDashboard,
  UserRound,
  Files,
  BadgeCheck,
  Globe2,
  History,
  Settings,
];
const navigation = [
  ["/", "Overview"],
  ["/identity", "My Identity"],
  ["/documents", "Documents"],
  ["/credentials", "Credentials"],
  ["/connections", "Connected Websites"],
  ["/history", "Verification History"],
  ["/security", "Security Settings"],
];
const pretty = (s: string) =>
  s.replaceAll(".", " ").replaceAll("-", " ").replaceAll("_", " ");
const time = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
const categoryNames: Record<string, string> = {
  tenth: "10th Certificate",
  intermediate: "Intermediate Certificate",
  btech: "B.Tech Certificate",
};
function Mark() {
  return (
    <span className="brand-mark">
      <ShieldCheck size={25} />
    </span>
  );
}
function Tag({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"tag " + tone}>{children}</span>;
}
function Loader() {
  return (
    <div className="loading">
      <span className="spinner" /> Loading your wallet…
    </div>
  );
}
function Empty({
  icon: Icon = Shield,
  text,
  detail,
  children,
}: {
  icon?: any;
  text: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={26} />
      </span>
      <h3>{text}</h3>
      <p>{detail}</p>
      {children}
    </div>
  );
}
function PageHeading({
  eyebrow = "YOUR PRIVATE WORKSPACE",
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function useData(path: string) {
  const { version } = useApp();
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    api(path)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return { data, error };
}
function ErrorBox({ text }: { text: string }) {
  return text ? (
    <div role="alert" className="error-box">
      {text}
    </div>
  ) : null;
}
function App() {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0),
    [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
      null,
    );
  const refresh = async () => {
    try {
      const s = await api("/auth/session");
      csrf = s.csrf;
      setSession(s);
    } catch {
      setSession(null);
      csrf = "";
    } finally {
      setLoading(false);
      setVersion((v) => v + 1);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  if (loading) return <Loader />;
  return (
    <Context.Provider
      value={{
        session: session!,
        refresh,
        version,
        notify: (text, error) => setToast({ text, error }),
      }}
    >
      {session ? <Shell /> : <Auth onLogin={refresh} />}{" "}
      {toast && (
        <div role="status" className={"toast " + (toast.error ? "bad" : "")}>
          <CheckCircle2 size={18} />
          {toast.text}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
function Auth({ onLogin }: { onLogin: () => Promise<void> }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/auth/" + (register ? "register" : "login"), "POST", {
        email: f.get("email"),
        password: f.get("password"),
        ...(register
          ? {
              confirmation: f.get("confirmation"),
              consent: f.get("consent") === "on",
            }
          : {}),
      });
      await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <div className="brand">
          <Mark />
          ProofGate<span className="brand-dot">.</span>
        </div>
        <Tag tone="dark">PRIVACY, BY DESIGN</Tag>
        <h1>
          Your identity.
          <br />
          Only what
          <br />
          <em>you choose.</em>
        </h1>
        <p>
          Prove what matters. Keep the rest private.
          <br />
          Your digital identity, with you in control.
        </p>
        <div className="proof-orbit">
          <div className="orbit-ring" />
          <div className="orbit-ring second" />
          <div className="orbit-core">
            <Fingerprint size={72} />
          </div>
          <span className="orbit-label one">
            <Check size={14} /> Age verified
          </span>
          <span className="orbit-label two">
            <LockKeyhole size={14} /> Birthday stays private
          </span>
        </div>
        <div className="auth-foot">
          <ShieldCheck size={17} /> Real cryptography. Minimal disclosure.
        </div>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-top">
          <Tag>HACKATHON EDITION</Tag>
          <span>Local demo environment</span>
        </div>
        <div className="auth-form">
          <h2>{register ? "Create your wallet" : "Welcome to your wallet"}</h2>
          <p>
            {register
              ? "A private place for your identity and credentials."
              : "Sign in to manage your identity, on your terms."}
          </p>
          <form onSubmit={submit}>
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
                placeholder="At least 12 characters"
              />
            </label>
            {register && (
              <>
                <label>
                  Confirm password
                  <input
                    name="confirmation"
                    type="password"
                    required
                    minLength={12}
                    autoComplete="new-password"
                  />
                </label>
                <label className="check-label">
                  <input name="consent" type="checkbox" required />
                  <span>
                    I agree to use test data and accept the privacy terms below.
                  </span>
                </label>
              </>
            )}
            <ErrorBox text={error} />
            <button className="button primary wide" disabled={busy}>
              {busy
                ? "Securing your session…"
                : register
                  ? "Create wallet"
                  : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? "Already have a wallet?" : "New to ProofGate?"}{" "}
            <button
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register ? "Sign in" : "Create a wallet"}
            </button>
          </p>
          <details className="privacy-terms">
            <summary>Privacy & demo terms</summary>
            <p>
              Use test information only. The ProofGate server can decrypt your
              encrypted profile, documents, and credential secrets to generate
              proofs. This is not end-to-end encryption. Demo credentials are
              not government or university verification. Websites receive only
              claims you approve. Security logs retain redacted metadata for 30
              days. Email ownership requires configured SMTP.
            </p>
          </details>
        </div>
        <div className="auth-bottom">
          <LockKeyhole size={14} /> Encrypted storage · Secure sessions ·
          Explicit consent
        </div>
      </section>
    </div>
  );
}
function Shell() {
  const { session, refresh } = useApp();
  const [menu, setMenu] = useState(false);
  const [databaseStatus, setDatabaseStatus] = useState<
    "checking" | "connected" | "disconnected"
  >("checking");
  const location = useLocation();
  const title =
    navigation.find(([p]) => p === location.pathname)?.[1] ||
    "Authorize website";
  const databaseStatusLabel =
    databaseStatus === "checking"
      ? "Checking database"
      : databaseStatus === "connected"
        ? "Database connected"
        : "Database unavailable";
  useEffect(() => {
    let active = true;
    const checkDatabase = async () => {
      try {
        const response = await fetch("/health/database", {
          cache: "no-store",
        });
        const status = await response.json();
        if (active)
          setDatabaseStatus(
            response.ok && status.database === "connected"
              ? "connected"
              : "disconnected",
          );
      } catch {
        if (active) setDatabaseStatus("disconnected");
      }
    };
    void checkDatabase();
    const interval = setInterval(() => void checkDatabase(), 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);
  return (
    <div className="shell">
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <Link to="/" className="brand">
          <Mark />
          ProofGate<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-label">PERSONAL WALLET</div>
        <nav>
          {navigation.map(([path, label], i) => {
            const Icon = icons[i];
            return (
              <NavLink
                key={path}
                to={path}
                end={path === "/"}
                onClick={() => setMenu(false)}
              >
                <Icon size={19} />
                {label}
                {path === "/credentials" && <span className="nav-new">ZK</span>}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={25} />
            <strong>Privacy is a right.</strong>
            <p>
              Share a proof.
              <br />
              Keep your story.
            </p>
            <span>POWERED BY ZERO KNOWLEDGE</span>
          </div>
          <button
            className="logout"
            onClick={async () => {
              await api("/auth/logout", "POST");
              await refresh();
            }}
          >
            <LogOut size={18} />
            Log out
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              aria-label="Toggle navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
            <span>My wallet</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="secure-dot" />
            <span className="session-label">Secure session</span>
            <span
              className={"database-status " + databaseStatus}
              role="status"
              aria-label={databaseStatusLabel}
            >
              <span className="database-status-dot" aria-hidden="true" />
              <span className="database-status-label">{databaseStatusLabel}</span>
            </span>
            <div className="avatar">{session.email[0].toUpperCase()}</div>
          </div>
        </header>
        <div className="content">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/identity" element={<Identity />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/credentials" element={<Credentials />} />
            <Route path="/connections" element={<Connections />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/security" element={<Security />} />
            <Route path="/authorize/:id" element={<Authorize />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <footer className="wallet-footer">
            <span>
              <ShieldCheck size={14} /> Built on trust. Designed for privacy.
            </span>
            <span>
              ProofGate v1.0 <b>·</b> Demo issuer environment
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
function Overview() {
  const { data, error } = useData("/wallet/summary");
  if (error) return <ErrorBox text={error} />;
  if (!data) return <Loader />;
  return (
    <>
      <PageHeading
        title="Your identity. Your control."
        description="Everything you need to prove more, and share less."
        action={
          <Link className="button secondary" to="/identity">
            <UserRound size={16} />
            Manage identity
          </Link>
        }
      />
      <section className="hero-card">
        <div>
          <Tag tone="dark">
            <span className="secure-dot" /> YOUR PRIVACY COMES FIRST
          </Tag>
          <h2>
            Be verified.
            <br />
            Without being exposed.
          </h2>
          <p>
            Let websites know you qualify.
            <br />
            {" "}
            Keep your personal details where they belong — with you.
          </p>
          <Link to="/credentials" className="button light">
            Explore your credentials <ArrowRight size={17} />
          </Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-grid" />
          <div className="id-card">
            <div className="id-card-head">
              <ShieldCheck size={21} />
              <span>PROOFGATE ID</span>
              <span className="id-chip">◆</span>
            </div>
            <Fingerprint size={65} />
            <div className="id-lines">
              <i />
              <i />
            </div>
            <div className="id-card-foot">
              PRIVATE BY DEFAULT <LockKeyhole size={13} />
            </div>
          </div>
          <div className="verified-float">
            <span>
              <Check size={18} />
            </span>
            <div>
              <strong>Proof, not personal data</strong>
              <small>Zero-knowledge verification</small>
            </div>
          </div>
        </div>
      </section>
      <div className="stats-grid">
        {[
          [
            UserRound,
            "Identity completion",
            data.identityComplete ? "100%" : "0%",
            data.identityComplete ? "Profile ready" : "Get started",
            "blue",
          ],
          [
            Files,
            "Private documents",
            String(data.documents),
            "Encrypted in your vault",
            "purple",
          ],
          [
            BadgeCheck,
            "Active credentials",
            String(data.credentials),
            "Demo issuer credentials",
            "green",
          ],
          [
            ShieldCheck,
            "Verified requests",
            String(data.verifications),
            "Only with your approval",
            "orange",
          ],
        ].map(([Icon, label, value, detail, tone]: any) => (
          <div className="stat-card" key={label}>
            <div className={"stat-icon " + tone}>
              <Icon size={21} />
            </div>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Your private vault</h2>
              <p>Documents are yours. Credentials are what you share.</p>
            </div>
            <Link to="/documents">
              View all <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="vault-categories">
            {Object.entries(categoryNames).map(([key, name], i) => (
              <Link to="/documents" className="vault-category" key={key}>
                <span className={"document-icon color" + i}>
                  <FileText size={24} />
                </span>
                <strong>{name}</strong>
                <small>Private source document</small>
                <span className="category-arrow">
                  <ArrowUpRight size={15} />
                </span>
              </Link>
            ))}
          </div>
          <div className="panel-note">
            <LockKeyhole size={14} /> AES-256-GCM encryption · Only accessible
            from your wallet
          </div>
        </section>
        <section className="panel next-step">
          <span className="section-icon">
            <KeyRound size={21} />
          </span>
          <h2>
            {data.credentials
              ? "Ready to prove it?"
              : "Your first proof starts here."}
          </h2>
          <p>
            {data.credentials
              ? "Try a connected demo website and choose exactly what to share."
              : "Set up your identity, review it with the demo issuer, and receive a test credential."}
          </p>
          <Link to={data.credentials ? "/connections" : "/credentials"}>
            {data.credentials
              ? "Explore demo websites"
              : "Get a test credential"}
            <ArrowRight size={17} />
          </Link>
          <div className="steps">
            <span className="done">
              <Check size={12} /> Wallet
            </span>
            <i />
            <span className={data.identityComplete ? "done" : ""}>
              Identity
            </span>
            <i />
            <span className={data.credentials ? "done" : ""}>Proof</span>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Recent activity</h2>
            <p>A clear record of what happens in your wallet.</p>
          </div>
          <Link to="/history">
            View history <ArrowUpRight size={15} />
          </Link>
        </div>
        <Activity rows={data.activity.slice(0, 4)} />
      </section>
    </>
  );
}
function Activity({ rows }: { rows: any[] }) {
  return rows.length ? (
    <div className="activity-list">
      {rows.map((r) => (
        <div className="activity-row" key={r.id}>
          <span className="activity-icon">
            <ShieldCheck size={18} />
          </span>
          <div>
            <strong>{pretty(r.event)}</strong>
            <small>
              {r.website || "Your private wallet"}
              {r.claim ? " · " + pretty(r.claim) : ""}
              {r.validity ? " · " + r.validity : ""}
            </small>
          </div>
          <Tag tone={r.outcome === "denied" ? "gray" : "green"}>
            {r.outcome}
          </Tag>
          <time>{time(r.createdAt)}</time>
        </div>
      ))}
    </div>
  ) : (
    <Empty
      icon={History}
      text="Your history starts here"
      detail="Your decisions and verification outcomes will appear here."
    />
  );
}
function Identity() {
  const { data, error } = useData("/wallet/identity");
  const { session, refresh, notify } = useApp();
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await api("/wallet/identity", "PUT", Object.fromEntries(f));
      await refresh();
      notify("Identity saved. Previous age credentials were revoked.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="My identity"
        description="Your private profile. You decide what a website gets to know."
      />
      <ErrorBox text={error} />
      {!data ? (
        <Loader />
      ) : (
        <div className="form-layout">
          <section className="panel form-panel">
            <div className="panel-header">
              <h2>Personal information</h2>
              <Tag tone="gray">Self-entered</Tag>
            </div>
            <form key={JSON.stringify(data.profile)} onSubmit={submit}>
              <div className="form-grid">
                {[
                  ["firstName", "First name", "text", true],
                  ["middleName", "Middle name (optional)", "text", false],
                  ["lastName", "Last name", "text", true],
                ].map(([name, label, type, required]: any) => (
                  <label key={name}>
                    {label}
                    <input
                      name={name}
                      type={type}
                      required={required}
                      defaultValue={data.profile?.[name] || ""}
                      min={type === "date" ? "1900-01-01" : undefined}
                      max={
                        type === "date"
                          ? new Date().toISOString().slice(0, 10)
                          : undefined
                      }
                      maxLength={80}
                    />
                  </label>
                ))}
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    readOnly
                    value={session.email}
                  />
                </label>
                <label>
                  Phone number
                  <input
                    name="phone"
                    type="tel"
                    required
                    pattern="[+0-9 ()\-]{7,20}"
                    defaultValue={data.profile?.phone || ""}
                    placeholder="+91 98765 43210"
                  />
                </label>
                <label>
                  Gender (optional)
                  <select
                    name="gender"
                    defaultValue={data.profile?.gender || ""}
                  >
                    <option value="">Not specified</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="nonbinary">Nonbinary</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                </label>
                <DobField initial={data.profile?.dob || ""} />
              </div>
              <div className="form-actions">
                <span>
                  <LockKeyhole size={14} /> Private wallet information
                </span>
                <button className="button primary" disabled={busy}>
                  {busy ? "Saving…" : "Save identity"}
                  <Check size={16} />
                </button>
              </div>
            </form>
          </section>
          <aside className="panel explain">
            <Shield size={27} />
            <h3>Information is not verification.</h3>
            <p>
              This profile is self-entered. An age credential must be issued
              separately after the demo issuer review.
            </p>
            <p>
              Updating your profile revokes existing age credentials so they
              cannot prove outdated claims.
            </p>
            <div className="divider" />
            <strong>A note on birthdays</strong>
            <p>
              Age updates on your birthday using UTC calendar dates. A February
              29 birthday reaches its anniversary on March 1 in non-leap years.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
function Documents() {
  const { data, error } = useData("/wallet/documents");
  const { refresh, notify } = useApp();
  const [busy, setBusy] = useState("");
  async function upload(category: string, file?: File) {
    if (!file) return;
    setBusy(category);
    try {
      if (file.size > 8 * 1024 * 1024)
        throw new Error("Maximum file size is 8 MB.");
      const f = new FormData();
      f.set("file", file);
      await api("/wallet/documents/" + category, "POST", f);
      await refresh();
      notify("Document encrypted and stored privately.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  }
  async function remove(id: string) {
    try {
      await api("/wallet/documents/" + id, "DELETE");
      await refresh();
      notify("Document deleted; related test credentials revoked.");
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <>
      <PageHeading
        title="Your document vault"
        description="A secure home for your source documents. Never shared with websites."
      />
      <div className="info-banner">
        <LockKeyhole size={19} />
        <div>
          <strong>Encrypted at rest. Private by default.</strong>
          <span>
            PDF, PNG, or JPEG · Up to 8 MB each · Uploading does not verify
            authenticity.
          </span>
        </div>
      </div>
      <ErrorBox text={error} />
      {!data ? (
        <Loader />
      ) : (
        <div className="documents-grid">
          {Object.entries(categoryNames).map(([key, name], i) => {
            const d = data.find((x: any) => x.category === key);
            return (
              <section className="panel document-card" key={key}>
                <div className="doc-card-top">
                  <span className={"document-icon color" + i}>
                    <FileText size={28} />
                  </span>
                  <Tag tone={d ? "green" : "gray"}>
                    {d ? "Stored privately" : "Not uploaded"}
                  </Tag>
                </div>
                <h2>{name}</h2>
                <p>{d ? d.name : "Add your educational source document."}</p>
                {d ? (
                  <>
                    <dl>
                      <dt>File size</dt>
                      <dd>{Math.ceil(d.size / 1024)} KB</dd>
                      <dt>Uploaded</dt>
                      <dd>{new Date(d.createdAt).toLocaleDateString()}</dd>
                      <dt>Credential</dt>
                      <dd>
                        {d.credentialIssued
                          ? "Demo credential issued"
                          : "Not issued"}
                      </dd>
                      <dt>Malware scan</dt>
                      <dd>
                        {d.scanStatus === "scanner-passed"
                          ? "Scanner passed"
                          : "Not scanned · development"}
                      </dd>
                    </dl>
                    <div className="document-actions">
                      <a
                        href={"/api/wallet/documents/" + d.id + "/file"}
                        target="_blank"
                        rel="noreferrer"
                        className="button secondary"
                      >
                        <Eye size={15} />
                        Preview
                      </a>
                      <a
                        href={
                          "/api/wallet/documents/" + d.id + "/file?download=1"
                        }
                        className="icon-button"
                        aria-label={"Download " + name}
                      >
                        <Download size={17} />
                      </a>
                      <button
                        className="icon-button danger"
                        aria-label={"Delete " + name}
                        onClick={() => remove(d.id)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="upload-empty">
                    <Upload size={29} />
                    <span>Your document stays in your wallet.</span>
                  </div>
                )}
                <label
                  className={
                    "button " +
                    (d ? "secondary" : "primary") +
                    " wide upload-button"
                  }
                >
                  {busy === key
                    ? "Encrypting & storing…"
                    : d
                      ? "Replace document"
                      : "Upload document"}
                  <Plus size={16} />
                  <input
                    type="file"
                    aria-label={"Upload " + name}
                    accept=".pdf,.png,.jpg,.jpeg"
                    disabled={!!busy}
                    onChange={(e) => {
                      void upload(key, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              </section>
            );
          })}
        </div>
      )}
      <div className="muted-note">
        <ShieldCheck size={18} />
        <p>
          ProofGate’s backend can decrypt files for authenticated access. This
          vault is encrypted at rest, not end-to-end encrypted. In development,
          scanning is available only when ClamAV is configured.
        </p>
      </div>
    </>
  );
}
function Credentials() {
  const { data, error } = useData("/credentials");
  const { refresh, notify } = useApp();
  const [issuing, setIssuing] = useState(""),
    [busy, setBusy] = useState(false);
  async function issue(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await api("/credentials/issue", "POST", {
        type: issuing,
        reviewed: true,
        understandDemo: true,
        ...(issuing === "age" ? { dobConfirmation: f.get("dob") } : {}),
      });
      setIssuing("");
      await refresh();
      notify("Test credential issued by the demo issuer.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    try {
      await api("/credentials/" + id + "/revoke", "POST");
      await refresh();
      notify("Credential revoked. New verification is blocked.");
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <>
      <PageHeading
        title="Your credentials"
        description="Make a specific claim, without sharing your whole identity."
      />
      <div className="info-banner amber">
        <BadgeCheck size={21} />
        <div>
          <strong>ProofGate Demo Issuer · Test credentials only</strong>
          <span>
            Not government-verified, university-verified, or legally
            authoritative.
          </span>
        </div>
      </div>
      <div className="credential-options">
        {[
          [
            "age",
            "Age eligibility",
            ShieldCheck,
            "Real Groth16 proof. Your date of birth stays private.",
          ],
          [
            "email",
            "Email credential",
            Mail,
            "Explicit email disclosure with accurate ownership status.",
          ],
          [
            "qualification",
            "B.Tech qualification",
            GraduationCap,
            "Signed test credential. The original certificate stays private.",
          ],
        ].map(([type, title, Icon, description]: any) => (
          <section className="panel credential-option" key={type}>
            <Icon size={26} />
            <h3>{title}</h3>
            <p>{description}</p>
            <button className="text-button" onClick={() => setIssuing(type)}>
              Issue test credential <Plus size={16} />
            </button>
          </section>
        ))}
      </div>
      <ErrorBox text={error} />
      <section className="panel">
        <div className="panel-header">
          <h2>Credential collection</h2>
          <Tag tone="gray">30-day validity</Tag>
        </div>
        {!data ? (
          <Loader />
        ) : !data.length ? (
          <Empty
            icon={BadgeCheck}
            text="No credentials yet"
            detail="Choose a credential above and complete the demo issuer review."
          />
        ) : (
          <div className="credential-list">
            {data.map((c: any) => {
              const active = !c.revokedAt && new Date(c.expiresAt) > new Date();
              return (
                <div className="credential-row" key={c.id}>
                  <div className="credential-seal">
                    <BadgeCheck size={24} />
                  </div>
                  <div>
                    <strong>
                      {c.type === "age"
                        ? "Age eligibility"
                        : c.type === "email"
                          ? "Email disclosure"
                          : "B.Tech qualification"}
                    </strong>
                    <small>
                      Demo-issued · Expires{" "}
                      {new Date(c.expiresAt).toLocaleDateString()}
                      {c.emailOwnership ? " · " + pretty(c.emailOwnership) : ""}
                    </small>
                  </div>
                  <Tag tone={active ? "green" : "gray"}>
                    {active ? "Active" : c.revokedAt ? "Revoked" : "Expired"}
                  </Tag>
                  {active && (
                    <button
                      className="text-button danger"
                      onClick={() => revoke(c.id)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      {issuing && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="issue-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close issuer review"
              onClick={() => setIssuing("")}
            >
              <X />
            </button>
            <Tag tone="amber">TEST ISSUANCE</Tag>
            <h2 id="issue-title">Demo issuer review</h2>
            <p>
              {issuing === "age"
                ? "Review your saved identity and confirm the same date of birth. This tests issuance; it does not authenticate your real birthday."
                : issuing === "email"
                  ? "We use your account email. SMTP verification, if completed, proves mailbox access. Otherwise this credential explicitly says unverified-demo."
                  : "Upload and preview your B.Tech certificate in Documents first. This review issues a test qualification assertion; it does not authenticate the certificate."}
            </p>
            <form onSubmit={issue}>
              {issuing === "age" && (
                <label>
                  Confirm your saved date of birth
                  <input name="dob" type="date" required />
                </label>
              )}
              <label className="check-label">
                <input type="checkbox" required />
                <span>I reviewed the relevant profile or source document.</span>
              </label>
              <label className="check-label">
                <input type="checkbox" required />
                <span>
                  I understand this is a test credential and no official
                  identity or education verification was performed.
                </span>
              </label>
              <button className="button primary wide" disabled={busy}>
                {busy ? "Issuing…" : "Issue demo credential"}
                <BadgeCheck size={17} />
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
function Connections() {
  const { data, error } = useData("/wallet/connections");
  const { refresh, notify } = useApp();
  return (
    <>
      <PageHeading
        title="Connected websites"
        description="Your consent is specific. Every new request needs a fresh decision."
      />
      <div className="demo-grid">
        {[
          [
            "Afterhours",
            "Age eligibility",
            "Prove you’re 18+, without sharing your birthday.",
            4101,
            "age",
          ],
          [
            "Letterbox",
            "Email disclosure",
            "Choose to share your email and ownership status.",
            4102,
            "email",
          ],
          [
            "Campus Collective",
            "Education credential",
            "Share your B.Tech test claim, not your certificate.",
            4103,
            "student",
          ],
        ].map(([name, tag, description, port, cls]) => (
          <a
            className={"demo-card " + cls}
            href={"http://localhost:" + port}
            target="_blank"
            rel="noreferrer"
            key={name}
          >
            <Tag tone="dark">{tag}</Tag>
            <h2>{name}</h2>
            <p>{description}</p>
            <span>
              Open demo website
              <ArrowUpRight size={17} />
            </span>
          </a>
        ))}
      </div>
      <ErrorBox text={error} />
      <section className="panel">
        <div className="panel-header">
          <h2>Active connections</h2>
          <Tag tone="gray">No silent sharing</Tag>
        </div>
        {!data ? (
          <Loader />
        ) : data.length ? (
          data.map((c: any) => (
            <div className="credential-row" key={c.id}>
              <span className="activity-icon">
                <Globe2 size={23} />
              </span>
              <div>
                <strong>{c.name}</strong>
                <small>Connected {time(c.connectedAt)}</small>
              </div>
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await api("/wallet/connections/" + c.id, "DELETE");
                    await refresh();
                    notify(
                      "Website disconnected. Active demo sessions revoked.",
                    );
                  } catch (e) {
                    notify((e as Error).message, true);
                  }
                }}
              >
                Disconnect
              </button>
            </div>
          ))
        ) : (
          <Empty
            icon={Globe2}
            text="Your wallet is yours alone"
            detail="Approve a demo website request to see a connection here."
          />
        )}
      </section>
      <div className="muted-note">
        <Shield size={18} />
        <p>
          Disconnecting blocks active gateway sessions. It cannot erase
          information that a website has already received.
        </p>
      </div>
    </>
  );
}
function HistoryPage() {
  const { data, error } = useData("/wallet/history");
  return (
    <>
      <PageHeading
        title="Verification history"
        description="Your decisions, recorded clearly. No private proof inputs are stored here."
      />
      <ErrorBox text={error} />
      <section className="panel">
        <div className="panel-header">
          <h2>Wallet activity</h2>
          <Tag tone="gray">Latest 100 events</Tag>
        </div>
        {data ? <Activity rows={data} /> : <Loader />}
      </section>
      <p className="muted-note">
        Authorization requests expire after five minutes. Credentials expire
        after 30 days; current revocation status is shown in Credentials. Audit
        metadata is retained for up to 30 days by the cleanup task.
      </p>
    </>
  );
}
function Security() {
  const { session, refresh, notify } = useApp();
  const [sent, setSent] = useState(false);
  return (
    <>
      <PageHeading
        title="Security settings"
        description="Understand your protections and manage your current session."
      />
      <div className="security-grid">
        <section className="panel form-panel">
          <div className="panel-header">
            <h2>Email ownership</h2>
            <Tag tone={session.emailVerified ? "green" : "amber"}>
              {session.emailVerified ? "Verified" : "Unverified"}
            </Tag>
          </div>
          <p>{session.email}</p>
          <p className="subtle">
            {session.emailMode === "smtp"
              ? "Confirm access to your mailbox with a one-time code."
              : "Development mode: SMTP is not configured. No OTP is generated or exposed, and email remains unverified. You can issue a clearly labeled test email credential."}
          </p>
          {!session.emailVerified && session.emailMode === "smtp" && (
            <>
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await api("/auth/email-otp", "POST");
                    setSent(true);
                    notify("Verification code sent to your inbox.");
                  } catch (e) {
                    notify((e as Error).message, true);
                  }
                }}
              >
                Send verification code
              </button>
              {sent && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await api("/auth/email-otp/verify", "POST", {
                        otp: new FormData(e.currentTarget).get("otp"),
                      });
                      await refresh();
                      notify(
                        "Email ownership verified. Reissue your email credential.",
                      );
                    } catch (e) {
                      notify((e as Error).message, true);
                    }
                  }}
                >
                  <label>
                    Six-digit code
                    <input
                      name="otp"
                      required
                      pattern="[0-9]{6}"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </label>
                  <button className="button primary">Verify code</button>
                </form>
              )}
            </>
          )}
        </section>
        <section className="panel form-panel">
          <div className="panel-header">
            <h2>Active session</h2>
            <LockKeyhole size={19} />
          </div>
          <p className="subtle">
            Your session uses an HTTP-only cookie and expires{" "}
            {time(session.expiresAt)}.
          </p>
          <button
            className="button secondary"
            onClick={async () => {
              await api("/auth/logout-all", "POST");
              await refresh();
            }}
          >
            Sign out of all sessions <LogOut size={16} />
          </button>
        </section>
      </div>
      <section className="panel architecture">
        <h2>What stays private — and from whom</h2>
        <div className="architecture-grid">
          <div>
            <LockKeyhole />
            <h3>Encrypted storage</h3>
            <p>
              Profiles, document contents, and credential secrets are encrypted.
              The server holds the decryption key.
            </p>
          </div>
          <div>
            <Fingerprint />
            <h3>Real age proofs</h3>
            <p>
              The gateway verifies a Groth16 proof tied to your credential and
              the website’s one-use request.
            </p>
          </div>
          <div>
            <Eye />
            <h3>Clear trust boundary</h3>
            <p>
              The server can read private data to generate proofs. Demo websites
              see only the results you approve.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
function Authorize() {
  const { id } = useParams();
  const { data, error } = useData("/gateway/requests/" + id);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  async function decide(approve: boolean) {
    setBusy(true);
    setFailure("");
    try {
      const result = await api(
        "/gateway/requests/" + id + "/" + (approve ? "approve" : "reject"),
        "POST",
        approve ? { approved: true } : {},
      );
      window.location.assign(result.redirectUrl);
    } catch (e) {
      setFailure((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="A REQUEST FOR YOUR PERMISSION"
        title="You choose what to share."
        description="Review this website’s request before continuing."
      />
      <ErrorBox text={error} />
      {!data ? (
        !error && <Loader />
      ) : (
        <section className="authorization panel">
          <div className="authorization-icons">
            <Mark />
            <span>···</span>
            <span className="website-symbol">
              <Globe2 size={28} />
            </span>
          </div>
          <h2>{data.website} wants to connect</h2>
          <p className="subtle">{data.origin}</p>
          <Tag tone="amber">Demo credentials · test environment</Tag>
          <div className="requested-claim">
            <ShieldCheck size={24} />
            <div>
              <strong>
                {data.claims[0].type === "age_over"
                  ? "Prove you are at least 18"
                  : data.claims[0].type === "email_disclosure"
                    ? "Share your email address"
                    : "Prove B.Tech test credential possession"}
              </strong>
              <p>
                {data.claims[0].type === "age_over"
                  ? "A real zero-knowledge proof. Your birthday and exact age will not be shared."
                  : data.claims[0].type === "email_disclosure"
                    ? "This website will receive your email address and its ownership status. This is explicit disclosure, not a zero-knowledge email proof."
                    : "A signed demo qualification claim will be shared. Your certificate, grades, and personal profile will not be shared."}
              </p>
            </div>
          </div>
          <div className="consent-details">
            <div>
              <Check size={16} /> Only the requested claim and a
              website-specific identifier
            </div>
            <div>
              <LockKeyhole size={16} /> No access to your profile or document
              files
            </div>
            <div>
              <History size={16} /> One-use request · Expires{" "}
              {time(data.expiresAt)}
            </div>
          </div>
          <ErrorBox text={failure} />
          <div className="authorization-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => decide(false)}
            >
              Decline request
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => decide(true)}
            >
              {busy ? (
                <>
                  <span className="spinner" />
                  Processing securely…
                </>
              ) : (
                <>
                  Approve & continue
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </div>
          <p className="small-print">
            Approving instructs ProofGate to generate and independently verify
            the requested proof or validate the signed credential. Demo
            assertions are not official verification.
          </p>
        </section>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
