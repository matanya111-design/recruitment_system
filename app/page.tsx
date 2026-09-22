"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";

type View = "dashboard" | "jobs" | "job" | "candidates" | "candidate" | "archive" | "guide" | "ai-activity" | "ai-instructions" | "users";
type AiInstruction = { key: string; title: string; description: string; content: string; isCustom: boolean; updatedAt: string };
type CurrentUser = { email: string; name: string; isAuthenticated: boolean; isAllowed: boolean; isAdmin: boolean };
type AppUser = { email: string; role: "admin" | "user"; createdAt: string; updatedAt: string };
type AiActivity = {
  id: number; actionType: string; subjectLabel: string; model: string;
  inputTokens: number; outputTokens: number; cachedInputTokens: number;
  estimatedCostUsd: number; createdAt: string;
};
type ArchivedJob = { id: number; title: string; client: string; status: string; updatedAt: string };
type ArchivedApplication = { applicationId: number; candidateName: string; role: string; client: string; status: string; updatedAt: string };
type Job = {
  id: number;
  title: string;
  client: string;
  status: string;
  description: string;
  must: string;
  preferred: string;
  emphasis: string;
  personality: string;
  notes: string;
  minYears: number | null;
  tech: string[];
  candidates: number;
  highFit: number;
  reasonableFit: number;
  created: string;
  updated: string;
};
type EvaluationResult = {
  gate_status: string;
  score: number;
  fit_label: string;
  recommendation: string;
  bottom_line: string;
  executive_summary: string;
  strengths: { requirement: string; evidence: string; assessment: string }[];
  gaps: {
    requirement: string;
    candidate_has: string;
    missing: string;
    criticality: string;
    completion_likelihood: string;
  }[];
  uncertainties: string[];
  questions: {
    question: string;
    why: string;
    good_answer: string;
    red_flag: string;
    interviewer_explanation: string;
  }[];
  technology_fit: string;
  experience_fit: string;
  risks: string[];
  cv_changes_needed: boolean;
  cv_change_recommendations: { location: string; change: string; reason: string; evidence: string }[];
  generalizable_feedback: boolean;
  proposed_engine_rule: string;
  recruitment_email: string;
};
type Candidate = {
  id: number;
  applicationId: number;
  jobId: number;
  name: string;
  phone: string;
  email: string;
  linkedin: string;
  professionalTitle: string;
  company: string;
  years: number;
  tech: string[];
  summary: string;
  recruiterOpinion: string;
  role: string;
  client: string;
  score: number | null;
  status: string;
  recommendation: string;
  interview: string;
  interviewSummary: string;
  nextAction: string;
  nextActionDate: string;
  evaluationType: string;
  evaluationDate: string;
  evaluation: EvaluationResult | null;
  evaluationFeedback: string;
  proposedEngineRule: string;
  engineRuleStatus: string;
  cvFilename: string;
  cvSize: number;
  cvPages: number | null;
  cvStatus: string;
  cvUploadedAt: string;
  cvTextLength: number;
  created: string;
  updated: string;
  initials: string;
  color: string;
};

const colors = [
  "violet",
  "blue",
  "green",
  "orange",
  "pink",
  "cyan",
  "red",
  "indigo",
  "teal",
];
const parseJson = (value: unknown): string[] => {
  try {
    return JSON.parse(String(value || "[]"));
  } catch {
    return [];
  }
};
const parseEvaluation = (value: unknown): EvaluationResult | null => {
  try {
    return value ? JSON.parse(String(value)) : null;
  } catch {
    return null;
  }
};
const formatDate = (value: string) =>
  value
    ? new Intl.DateTimeFormat("he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      }).format(new Date(value))
    : "טרם נקבע";
const interviewDateLabel = (date: string, status: string) =>
  date
    ? formatDate(date)
    : /בוצע|עבר ראיון|הועבר ללקוח|ראיון לקוח|התקבל|נסגר/.test(status)
      ? "תאריך לא הוזן"
      : "טרם נקבע";
const formatBytes = (value: number) =>
  value >= 1024 * 1024
    ? `${(value / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(value / 1024))} KB`;
const statusClass = (v: string) =>
  v.includes("נדחה") || v.includes("לא מתאים")
    ? "danger"
    : v.includes("בירור") || v.includes("חלקית")
      ? "warning"
      : v.includes("חדש") || v.includes("בדיקה") || v.includes("טרם")
        ? "neutral"
        : "success";

function AccessScreen({ title, text, action, href }: { title: string; text?: string; action?: string; href?: string }) {
  return <main className="access-screen" dir="rtl"><section className="panel access-card"><div className="access-logo">N</div><h1>{title}</h1>{text && <p>{text}</p>}{action && href && <a className="primary" href={href}>{action}</a>}</section></main>;
}

function LoginScreen({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "הכניסה נכשלה"); return; }
      onLogin(email);
    } catch { setError("שגיאת רשת"); } finally { setLoading(false); }
  }
  return (
    <main className="access-screen" dir="rtl">
      <section className="panel access-card">
        <div className="access-logo">N</div>
        <h1>כניסה למערכת</h1>
        <p>הזן את כתובת המייל שלך כדי להתחבר.</p>
        <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:"12px",marginTop:"8px"}}>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com" required style={{border:"1px solid #dfe2e9",borderRadius:"8px",padding:"10px",fontSize:"14px",direction:"ltr"}} />
          {error && <p style={{color:"#c84b4b",margin:0,fontSize:"13px"}}>{error}</p>}
          <button className="primary" type="submit" disabled={loading}>{loading ? "מתחבר..." : "כניסה"}</button>
        </form>
      </section>
    </main>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("dashboard"),
    [jobs, setJobs] = useState<Job[]>([]),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [archivedJobs, setArchivedJobs] = useState<ArchivedJob[]>([]),
    [archivedApplications, setArchivedApplications] = useState<ArchivedApplication[]>([]),
    [aiActivity, setAiActivity] = useState<AiActivity[]>([]),
    [aiInstructions, setAiInstructions] = useState<AiInstruction[]>([]),
    [appUsers, setAppUsers] = useState<AppUser[]>([]),
    [currentUser, setCurrentUser] = useState<CurrentUser>({ email: "", name: "", isAuthenticated: false, isAllowed: false, isAdmin: false });
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null),
    [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(
      null,
    );
  const [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState("הכול"),
    [menuOpen, setMenuOpen] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [modal, setModal] = useState<
    "job" | "candidate" | "editJob" | "editCandidate" | null
  >(null);
  const [, setLoginRefresh] = useState(0);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const sessionResponse = await fetch("/api/session");
      const session = await sessionResponse.json();
      if (!sessionResponse.ok) throw new Error(session.error || "שגיאת זיהוי");
      setCurrentUser(session);
      if (!session.isAllowed) return;
      const r = await fetch("/api/recruiting");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "שגיאה");
      setJobs(
        d.jobs.map((j: any) => ({
          id: j.id,
          title: j.title,
          client: j.client,
          status: j.status,
          description: j.description,
          must: j.must_requirements,
          preferred: j.preferred_requirements || "",
          emphasis: j.professional_emphasis,
          personality: j.personality_emphasis || "",
          notes: j.internal_notes || "",
          minYears: j.min_years === null ? null : Number(j.min_years),
          tech: parseJson(j.technologies),
          candidates: Number(j.candidates_count || 0),
          highFit: Number(j.high_fit_count || 0),
          reasonableFit: Number(j.reasonable_fit_count || 0),
          created: formatDate(j.created_at),
          updated: formatDate(j.updated_at),
        })),
      );
      setCandidates(
        d.candidates.map((c: any, i: number) => ({
          id: c.id,
          applicationId: c.application_id,
          jobId: c.job_id,
          name: c.full_name,
          phone: c.phone,
          email: c.email,
          linkedin: c.linkedin_url,
          professionalTitle: c.professional_title || "",
          company: c.company,
          years: Number(c.years_experience || 0),
          tech: parseJson(c.technologies),
          summary: c.experience_summary,
          recruiterOpinion: c.recruiter_opinion || "",
          role: c.role,
          client: c.client,
          score: c.score === null ? null : Number(c.score),
          status: c.status,
          recommendation: c.recommendation,
          interview: c.interview_date || "",
          interviewSummary: c.interview_summary || "",
          nextAction: c.next_action || "",
          nextActionDate: c.next_action_date || "",
          evaluationType: c.evaluation_type || "ראשונית",
          evaluationDate: c.evaluation_date || "",
          evaluation: parseEvaluation(c.evaluation_json),
          evaluationFeedback: c.evaluation_feedback || "",
          proposedEngineRule: c.proposed_engine_rule || "",
          engineRuleStatus: c.engine_rule_status || "ללא הצעה",
          cvFilename: c.cv_filename || "",
          cvSize: Number(c.cv_size || 0),
          cvPages: c.cv_pages === null ? null : Number(c.cv_pages),
          cvStatus: c.cv_extraction_status || "לא הועלה",
          cvUploadedAt: c.cv_uploaded_at || "",
          cvTextLength: Number(c.cv_text_length || 0),
          created: formatDate(c.candidate_created_at || c.created_at),
          updated: formatDate(c.application_updated_at || c.updated_at),
          initials: c.full_name
            .split(" ")
            .map((x: string) => x[0])
            .join("")
            .slice(0, 2),
          color: colors[i % colors.length],
        })),
      );
      setArchivedJobs((d.archivedJobs || []).map((j: any) => ({
        id: Number(j.id), title: j.title, client: j.client, status: j.status, updatedAt: j.updated_at,
      })));
      setArchivedApplications((d.archivedApplications || []).map((a: any) => ({
        applicationId: Number(a.application_id), candidateName: a.full_name,
        role: a.role, client: a.client, status: a.status, updatedAt: a.updated_at,
      })));
      setAiActivity((d.aiActivity || []).map((x: any) => ({
        id: Number(x.id), actionType: x.action_type, subjectLabel: x.subject_label,
        model: x.model, inputTokens: Number(x.input_tokens || 0),
        cachedInputTokens: Number(x.cached_input_tokens || 0),
        outputTokens: Number(x.output_tokens || 0),
        estimatedCostUsd: Number(x.estimated_cost_usd || 0), createdAt: x.created_at,
      })));
      setAiInstructions((d.aiInstructions || []).map((x: any) => ({
        key: x.key, title: x.title, description: x.description, content: x.content,
        isCustom: Boolean(x.is_custom), updatedAt: x.updated_at,
      })));
      setAppUsers((d.appUsers || []).map((x: any) => ({
        email: x.email, role: x.role, createdAt: x.created_at, updatedAt: x.updated_at,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "טעינה נכשלה");
    } finally {
      if (!silent) setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function api(method: string, body: Record<string, unknown>) {
    const r = await fetch("/api/recruiting", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "הפעולה נכשלה");
    await load(true);
    return d;
  }
  const selectedJob = jobs.find((j) => j.id === selectedJobId) || jobs[0],
    selectedCandidate =
      candidates.find((c) => c.applicationId === selectedCandidateId) ||
      candidates[0];
  const filtered = useMemo(
    () =>
      candidates.filter(
        (c) =>
          (c.name.includes(query) ||
            c.role.toLowerCase().includes(query.toLowerCase()) ||
            c.client.includes(query)) &&
          (statusFilter === "הכול" || c.status === statusFilter),
      ),
    [candidates, query, statusFilter],
  );
  const goJob = (j: Job) => {
      setSelectedJobId(j.id);
      setView("job");
    },
    goCandidate = (c: Candidate) => {
      setSelectedCandidateId(c.applicationId);
      setView("candidate");
    };
  const nav = [
    { key: "dashboard" as View, label: "לוח בקרה", icon: "⌂" },
    { key: "jobs" as View, label: "משרות", icon: "▣", badge: jobs.length },
    {
      key: "candidates" as View,
      label: "מועמדים",
      icon: "♙",
      badge: new Set(candidates.map((c) => c.id)).size,
    },
    { key: "archive" as View, label: "ארכיון", icon: "▤", badge: archivedJobs.length + archivedApplications.length },
    { key: "guide" as View, label: "מדריך ותיעוד", icon: "?" },
    { key: "ai-activity" as View, label: "פעילות AI ועלויות", icon: "✦" },
    ...(currentUser.isAdmin ? [
      { key: "users" as View, label: "משתמשים והרשאות", icon: "♚" },
      { key: "ai-instructions" as View, label: "הוראות AI", icon: "⚙" },
    ] : []),
  ];
  const userInitials = (currentUser.name || currentUser.email || "משתמש")
    .split(/\s+/).map((part) => part[0]).join("").slice(0, 2);
  if (loading) return <AccessScreen title="טוען את המערכת..." />;
  if (!currentUser.isAuthenticated) return <LoginScreen onLogin={() => { setLoginRefresh(p => p + 1); load(); }} />;
  if (!currentUser.isAllowed) return <AccessScreen title="אין לך הרשאה למערכת" text={`החשבון ${currentUser.email} מזוהה, אך אינו נמצא ברשימת המשתמשים. יש לפנות למנהל המערכת.`} action="יציאה" href="/api/auth/logout" />;  // admin must add user to allowlist
  return (
    <div className="app-shell" dir="rtl">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>
          ☰
        </button>
        <div className="brand-mark">N</div>
        <div className="top-title">
          <strong>ניהול והערכת מועמדים</strong>
          <span>גיוס טכנולוגי מבוסס AI</span>
        </div>
        <div className="top-spacer" />
        <div className="user-block">
          <div className="avatar user-avatar" title={userInitials} aria-label="משתמש מחובר" />
          <div>
            <strong>{currentUser.name || "משתמש מחובר"}</strong>
            <span>{currentUser.isAdmin ? "מנהל מערכת" : "משתמש מערכת"}</span>
          </div>
        </div>
      </header>
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <nav>
          <p className="nav-caption">ראשי</p>
          {nav.map((n) => (
            <button
              key={n.key}
              className={
                view === n.key ||
                (n.key === "jobs" && view === "job") ||
                (n.key === "candidates" && view === "candidate")
                  ? "active"
                  : ""
              }
              onClick={() => {
                setView(n.key);
                setMenuOpen(false);
              }}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
              {n.badge !== undefined && <em>{n.badge}</em>}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        {loading && <div className="loading">טוען נתונים...</div>}
        {error && (
          <div className="error-banner">
            לא ניתן לטעון את הנתונים: {error}
            <button onClick={() => load()}>נסה שוב</button>
          </div>
        )}
        {!loading && !error && (
          <>
            {view === "dashboard" && (
              <Dashboard
                jobs={jobs}
                candidates={candidates}
                goJob={goJob}
                goCandidate={goCandidate}
                addJob={() => setModal("job")}
                addCandidate={() => setModal("candidate")}
                setView={setView}
              />
            )}
            {view === "jobs" && (
              <Jobs jobs={jobs} goJob={goJob} addJob={() => setModal("job")} />
            )}
            {view === "job" && selectedJob && (
              <JobPage
                job={selectedJob}
                candidates={candidates.filter(
                  (c) => c.jobId === selectedJob.id,
                )}
                goCandidate={goCandidate}
                back={() => setView("jobs")}
                addCandidate={() => setModal("candidate")}
              edit={() => setModal("editJob")}
              remove={async () => {
                if (selectedJob.candidates > 0) {
                  alert("לא ניתן למחוק לצמיתות משרה שיש לה מועמדויות. ניתן להעביר אותה לארכיון.");
                  return;
                }
                if (confirm(`למחוק לצמיתות את המשרה ${selectedJob.title}? פעולה זו אינה ניתנת לביטול.`)) {
                  await api("DELETE", { entity: "job", id: selectedJob.id });
                  setView("jobs");
                }
              }}
                archive={async () => {
                  if (confirm("להעביר את המשרה לארכיון?")) {
                    await api("PATCH", {
                      entity: "job",
                      id: selectedJob.id,
                      archived: 1,
                    });
                    setView("jobs");
                  }
                }}
              />
            )}
            {view === "candidates" && (
              <Candidates
                rows={filtered}
                total={candidates.length}
                jobs={jobs}
                query={query}
                setQuery={setQuery}
                status={statusFilter}
                setStatus={setStatusFilter}
                goCandidate={goCandidate}
                add={() => setModal("candidate")}
              />
            )}
            {view === "candidate" && selectedCandidate && (
              <CandidatePage
                c={selectedCandidate}
                applications={candidates.filter(
                  (x) => x.id === selectedCandidate.id,
                )}
                jobs={jobs}
                selectApplication={(a) =>
                  setSelectedCandidateId(a.applicationId)
                }
                addApplication={async (jobId) => {
                  const d = await api("POST", {
                    entity: "application",
                    candidateId: selectedCandidate.id,
                    jobId,
                  });
                  setSelectedCandidateId(Number(d.applicationId));
                }}
                back={() => setView("candidates")}
                refresh={() => load(true)}
              updateCandidate={async (body) => {
                await api("PATCH", {
                  entity: "candidate",
                  id: selectedCandidate.id,
                  ...body,
                });
              }}
              editCandidate={() => setModal("editCandidate")}
              removeCandidate={async () => {
                if (confirm(`למחוק לצמיתות את ${selectedCandidate.name}?\n\nכל המועמדויות, הראיונות, הערכות ה-AI וקורות החיים יימחקו. פעולה זו אינה ניתנת לביטול.`)) {
                  await api("DELETE", { entity: "candidate", id: selectedCandidate.id });
                  setView("candidates");
                }
              }}
                save={async (body) => {
                  await api("PATCH", {
                    entity: "application",
                    id: selectedCandidate.applicationId,
                    ...body,
                  });
                }}
                archive={async () => {
                  if (
                    confirm(
                      "להעביר רק את המועמדות הנוכחית לארכיון? המועמד ושאר המועמדויות יישמרו.",
                    )
                  ) {
                    await api("PATCH", {
                      entity: "application",
                      id: selectedCandidate.applicationId,
                      archived: 1,
                    });
                    setView("candidates");
                  }
                }}
              />
            )}
            {view === "guide" && <UsageGuide setView={setView} />}
            {view === "archive" && (
              <ArchivePage
                jobs={archivedJobs}
                applications={archivedApplications}
                restoreJob={async (id) => {
                  await api("PATCH", { entity: "job", id, archived: 0 });
                }}
                restoreApplication={async (id) => {
                  await api("PATCH", { entity: "application", id, archived: 0 });
                }}
                refresh={() => load(true)}
              />
            )}
            {view === "ai-activity" && <AiActivityPage rows={aiActivity} />}
            {view === "ai-instructions" && currentUser.isAdmin && (
              <AiInstructionsPage
                rows={aiInstructions}
                save={async (key, content, reset = false) => {
                  await api("PATCH", { entity: "aiInstruction", key, content, reset });
                }}
                refresh={() => load(true)}
              />
            )}
            {view === "users" && currentUser.isAdmin && (
              <UserManagementPage
                rows={appUsers}
                ownerEmail={currentUser.email}
                save={async (email, role) => api("POST", { entity: "appUser", email, role })}
                remove={async (email) => api("DELETE", { entity: "appUser", email })}
              />
            )}
          </>
        )}
      </main>
      {modal === "job" && (
        <JobForm
          close={() => setModal(null)}
          save={async (b) => {
            await api("POST", { entity: "job", ...b });
            setModal(null);
          }}
        />
      )}
      {modal === "editJob" && selectedJob && (
        <JobForm
          job={selectedJob}
          close={() => setModal(null)}
          save={async (b) => {
            await api("PATCH", { entity: "job", id: selectedJob.id, ...b });
            setModal(null);
          }}
        />
      )}
    {modal === "candidate" && (
        <CandidateForm
          jobs={jobs}
          initialJobId={selectedJobId}
          close={() => setModal(null)}
          save={async (b) => {
            await api("POST", { entity: "candidate", ...b });
            setModal(null);
          }}
        />
    )}
    {modal === "editCandidate" && selectedCandidate && (
      <CandidateEditForm
        candidate={selectedCandidate}
        close={() => setModal(null)}
        save={async (body) => {
          await api("PATCH", { entity: "candidate", id: selectedCandidate.id, ...body });
          setModal(null);
        }}
      />
    )}
    </div>
  );
}

function Heading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  );
}
function Dashboard({
  jobs,
  candidates,
  goJob,
  goCandidate,
  addJob,
  addCandidate,
  setView,
}: {
  jobs: Job[];
  candidates: Candidate[];
  goJob: (j: Job) => void;
  goCandidate: (c: Candidate) => void;
  addJob: () => void;
  addCandidate: () => void;
  setView: (v: View) => void;
}) {
  const now = new Date();
  const israelHour = Number(new Intl.DateTimeFormat("he-IL", { hour: "2-digit", hour12: false, timeZone: "Asia/Jerusalem" }).format(now));
  const greeting = israelHour < 5 ? "לילה טוב" : israelHour < 12 ? "בוקר טוב" : israelHour < 17 ? "צהריים טובים" : israelHour < 22 ? "ערב טוב" : "לילה טוב";
  const today = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jerusalem" }).format(now);
  const active = jobs.filter((j) => j.status === "פעילה"),
    high = candidates.filter(
      (c) =>
        (c.score || 0) >= 75 &&
        ["מתאים", "מתאימה", "מתאים מאוד", "מתאימה מאוד"].includes(
          c.recommendation,
        ),
    ),
    reasonable = candidates.filter(
      (c) => (c.score || 0) >= 60 && (c.score || 0) < 75 && !["לא מתאים", "לא מתאימה", "לא רלוונטי לתפקיד"].includes(c.recommendation),
    ),
    uniqueCandidates = new Set(candidates.map((c) => c.id)).size;
  return (
    <>
      <Heading
        title={greeting}
        subtitle={`${today} · הנה תמונת המצב של תהליכי הגיוס שלך.`}
        action={<><button className="secondary" onClick={addCandidate}>＋ מועמד חדש</button><button className="primary" onClick={addJob}>＋ משרה חדשה</button></>}
      />
      <section className="stats-grid">
        <Stat
          icon="▣"
          tone="purple"
          value={active.length}
          label="משרות פעילות"
          note={`מתוך ${jobs.length} משרות`}
        />
        <Stat
          icon="♙"
          tone="blue"
          value={uniqueCandidates}
          label="מועמדים"
          note={`${candidates.length} מועמדויות פעילות`}
        />
        <article className="stat-card fit-stat"><div className="stat-icon green">✓</div><div><span>התאמת מועמדים</span><div className="fit-stat-values"><b><strong>{high.length}</strong><small>גבוהה</small></b><i /><b><strong>{reasonable.length}</strong><small>סבירה</small></b></div><em>גבוהה 75+ · סבירה 60-74</em></div></article>
        <Stat
          icon="!"
          tone="orange"
          value={candidates.filter((c) => c.nextAction && !["נדחה", "נסגר", "התקבל"].includes(c.status)).length}
          label="משימות פתוחות"
          note="מועמדויות פתוחות עם פעולה מוגדרת"
          urgent
        />
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>משימות להמשך</h2>
              <p>כל מועמדות פתוחה שיש לה פעולה קונקרטית לביצוע</p>
            </div>
            <button
              className="text-button"
              onClick={() => setView("candidates")}
            >
              הצג הכול ‹
            </button>
          </div>
          {candidates
            .filter((c) => c.nextAction && !["נדחה", "נסגר", "התקבל"].includes(c.status))
            .map((c) => (
              <button
                className="action-row"
                key={c.applicationId}
                onClick={() => goCandidate(c)}
              >
                <span className="action-icon orange">!</span>
                <span className="action-copy">
                  <strong>{c.name}</strong>
                  <small>{c.nextAction} · {c.role} · {c.client}</small>
                </span>
                {c.nextActionDate && <span className="action-time">{formatDate(c.nextActionDate)}</span>}
                <b>‹</b>
              </button>
            ))}
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>משרות פעילות</h2>
              <p>התקדמות לפי משרה</p>
            </div>
          </div>
          {active.map((j, i) => (
            <button
              className="job-progress"
              key={j.id}
              onClick={() => goJob(j)}
            >
              <div className={`mini-icon ${i ? "blue" : "purple"}`}>▣</div>
              <div className="progress-main">
                <strong>{j.title}</strong>
                <span>
                  {j.client} · {j.candidates} מועמדים
                </span>
              </div>
              <div className="job-fit-counts"><span><b>{j.highFit}</b><small>גבוהה</small></span><span><b>{j.reasonableFit}</b><small>סבירה</small></span></div>
            </button>
          ))}
        </section>
      </div>
      <section className="panel recent-panel">
        <div className="panel-head">
          <div>
            <h2>מועמדים אחרונים</h2>
            <p>המועמדויות הפעילות</p>
          </div>
          <button className="text-button" onClick={() => setView("candidates")}>
            כל המועמדים ‹
          </button>
        </div>
        <CandidateTable
          rows={candidates.slice(0, 5)}
          go={goCandidate}
          compact
        />
      </section>
    </>
  );
}
function Stat({
  icon,
  tone,
  value,
  label,
  note,
  urgent,
}: {
  icon: string;
  tone: string;
  value: number;
  label: string;
  note: string;
  urgent?: boolean;
}) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
        <small className={urgent ? "urgent" : ""}>{note}</small>
      </div>
    </article>
  );
}

function Jobs({
  jobs,
  goJob,
  addJob,
}: {
  jobs: Job[];
  goJob: (j: Job) => void;
  addJob: () => void;
}) {
  const [q, setQ] = useState("");
  const rows = jobs.filter(
    (j) =>
      j.title.toLowerCase().includes(q.toLowerCase()) || j.client.includes(q),
  );
  return (
    <>
      <Heading
        title="משרות"
        subtitle="ניהול המשרות הפתוחות ותהליכי הגיוס."
        action={
          <button className="primary" onClick={addJob}>
            ＋ משרה חדשה
          </button>
        }
      />
      <section className="panel table-panel">
        <div className="toolbar">
          <div className="search">
            ⌕
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש לפי משרה או לקוח..."
            />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>משרה</th>
                <th>לקוח</th>
                <th>סטטוס</th>
                <th>מועמדים</th>
                <th>התאמה גבוהה</th>
                <th>התאמה סבירה</th>
                <th>תאריך יצירה</th>
                <th>עדכון</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id} onClick={() => goJob(j)}>
                  <td>
                    <div className="job-cell">
                      <span>▣</span>
                      <strong>{j.title}</strong>
                    </div>
                  </td>
                  <td>{j.client}</td>
                  <td>
                    <span
                      className={`pill ${j.status === "פעילה" ? "success" : "neutral"}`}
                    >
                      {j.status}
                    </span>
                  </td>
                  <td>{j.candidates}</td>
                  <td>
                    <b className="score-text">{j.highFit}</b>
                  </td>
                  <td><b className="score-text reasonable-score">{j.reasonableFit}</b></td>
                  <td>{j.created}</td>
                  <td>{j.updated}</td>
                  <td>‹</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function JobPage({
  job,
  candidates,
  goCandidate,
  back,
  addCandidate,
  edit,
  archive,
  remove,
}: {
  job: Job;
  candidates: Candidate[];
  goCandidate: (c: Candidate) => void;
  back: () => void;
  addCandidate: () => void;
  edit: () => void;
  archive: () => void;
  remove: () => void;
}) {
  return (
    <>
      <button className="crumb" onClick={back}>
        משרות / <b>{job.title}</b>
      </button>
      <Heading
        title={job.title}
        subtitle={`${job.client} · עודכנה ${job.updated}`}
        action={
          <>
            <span
              className={`pill ${job.status === "פעילה" ? "success" : "neutral"}`}
            >
              {job.status}
            </span>
            <button className="secondary" onClick={edit}>
              עריכת משרה
            </button>
            <button className="archive-button" onClick={archive}>
              ארכיון
            </button>
            <button className="danger-text-button" onClick={remove}>
              מחיקה לצמיתות
            </button>
          </>
        }
      />
      <div className="job-detail-grid">
        <section className="panel detail-card">
          <h2>פרטי המשרה</h2>
          <h3>תיאור</h3>
          <p>{job.description || "לא הוזן"}</p>
          <h3>דרישות חובה</h3>
          <p>{job.must || "לא הוזנו"}</p>
          {job.preferred && (
            <>
              <h3>דרישות יתרון</h3>
              <p>{job.preferred}</p>
            </>
          )}
          <h3>דגשים מקצועיים</h3>
          <p>{job.emphasis || "לא הוזנו"}</p>
          {job.personality && (
            <>
              <h3>דגשים אישיותיים</h3>
              <p>{job.personality}</p>
            </>
          )}
          <h3>טכנולוגיות</h3>
          <div className="tags">
            {job.tech.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          {job.notes && (
            <>
              <h3>הערות פנימיות</h3>
              <p>{job.notes}</p>
            </>
          )}
        </section>
        <aside className="panel job-summary">
          <h2>תמונת מצב</h2>
          <div>
            <strong>{candidates.length}</strong>
            <span>מועמדים</span>
          </div>
          <div>
            <strong>{job.highFit}</strong>
            <span>התאמה גבוהה</span>
          </div>
          <div>
            <strong>{job.reasonableFit}</strong>
            <span>התאמה סבירה</span>
          </div>
          <div>
            <strong>
              {candidates.filter((c) => c.status.includes("ראיון")).length}
            </strong>
            <span>בתהליך ראיון</span>
          </div>
          {job.minYears !== null && (
            <div>
              <strong>{job.minYears}</strong>
              <span>שנות ניסיון נדרשות</span>
            </div>
          )}
        </aside>
      </div>
      <section className="panel table-panel">
        <div className="panel-head padded">
          <div>
            <h2>מועמדים למשרה</h2>
            <p>{candidates.length} מועמדים משויכים</p>
          </div>
          <button className="primary" onClick={addCandidate}>
            ＋ הוספת מועמד
          </button>
        </div>
        <CandidateTable rows={candidates} go={goCandidate} />
      </section>
    </>
  );
}

function Candidates({
  rows,
  total,
  jobs,
  query,
  setQuery,
  status,
  setStatus,
  goCandidate,
  add,
}: {
  rows: Candidate[];
  total: number;
  jobs: Job[];
  query: string;
  setQuery: (s: string) => void;
  status: string;
  setStatus: (s: string) => void;
  goCandidate: (c: Candidate) => void;
  add: () => void;
}) {
  const [jobFilter, setJobFilter] = useState("הכול");
  const visibleRows = jobFilter === "הכול" ? rows : rows.filter((c) => String(c.jobId) === jobFilter);
  return (
    <>
      <Heading
        title="מועמדים"
        subtitle="כל מועמדות מוצגת מול המשרה והסטטוס שלה. מועמד אחד יכול להופיע בכמה משרות."
        action={
          <button className="primary" onClick={add}>
            ＋ מועמד חדש
          </button>
        }
      />
      <section className="panel table-panel">
        <div className="toolbar multi">
          <div className="search">
            ⌕
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש מועמד, משרה או לקוח..."
            />
          </div>
          <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
            <option value="הכול">כל המשרות</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.title} · {j.client}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>הכול</option>
            {[
              "חדש",
              "בבדיקה",
              "דורש בירור",
              "מיועד לראיון",
              "ראיון בוצע",
              "עבר ראיון",
              "הועבר ללקוח",
              "בתהליך אצל הלקוח",
              "התקבל",
              "נדחה",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <CandidateTable rows={visibleRows} go={goCandidate} />
        <div className="table-footer">
          מציג {visibleRows.length} מתוך {total} מועמדויות
        </div>
      </section>
    </>
  );
}
function CandidateTable({
  rows,
  go,
  compact,
}: {
  rows: Candidate[];
  go: (c: Candidate) => void;
  compact?: boolean;
}) {
  const [sort, setSort] = useState<"name" | "role" | "client" | "score" | "status">("name");
  const [direction, setDirection] = useState<1 | -1>(1);
  function chooseSort(next: typeof sort) {
    if (sort === next) setDirection(direction === 1 ? -1 : 1);
    else { setSort(next); setDirection(1); }
  }
  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    const av = sort === "score" ? (a.score ?? -1) : String(a[sort] || "");
    const bv = sort === "score" ? (b.score ?? -1) : String(b[sort] || "");
    return (typeof av === "number" ? av - Number(bv) : av.localeCompare(String(bv), "he")) * direction;
  }), [rows, sort, direction]);
  const SortHead = ({ field, children }: { field: typeof sort; children: React.ReactNode }) => (
    <button className="sort-head" onClick={() => chooseSort(field)}>{children}{sort === field ? (direction === 1 ? " ↑" : " ↓") : ""}</button>
  );
  return (
    <div className="table-wrap">
      <table className="candidate-table">
        <thead>
          <tr>
            <th><SortHead field="name">מועמד</SortHead></th>
            <th><SortHead field="role">משרה</SortHead></th>
            <th><SortHead field="client">לקוח</SortHead></th>
            <th><SortHead field="score">ציון</SortHead></th>
            <th><SortHead field="status">סטטוס</SortHead></th>
            {!compact && <th>תאריך ראיון</th>}
            <th>המלצה</th>
            {!compact && <th>תאריך יצירה</th>}
            {!compact && <th>עדכון</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((c) => (
            <tr key={c.applicationId} onClick={() => go(c)}>
              <td>
                <div className="person">
                  <span className={`avatar ${c.color}`}>{c.initials}</span>
                  <div>
                    <strong>{c.name}</strong>
                    <small>
                      {c.company} · {c.years} שנות ניסיון
                    </small>
                  </div>
                </div>
              </td>
              <td>
                <strong>{c.role}</strong>
              </td>
              <td>{c.client}</td>
              <td>
                {c.score === null ? (
                  <span className="pill neutral">טרם הוערך</span>
                ) : (
                  <span
                    className={`score ${c.score >= 80 ? "high" : c.score >= 65 ? "mid" : "low"}`}
                  >
                    {c.score}
                  </span>
                )}
              </td>
              <td>
                <span className={`pill ${statusClass(c.status)}`}>
                  {c.status}
                </span>
              </td>
              {!compact && <td className={!c.interview && /בוצע|עבר ראיון|הועבר ללקוח|ראיון לקוח|התקבל|נסגר/.test(c.status) ? "missing-date" : ""}>{interviewDateLabel(c.interview, c.status)}</td>}
              <td>
                <span className={`recommend ${statusClass(c.recommendation)}`}>
                  ● {c.recommendation}
                </span>
              </td>
              {!compact && <td>{c.created}</td>}
              {!compact && <td>{c.updated}</td>}
              <td className="arrow">‹</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadableInterviewSummary({ text }: { text: string }) {
  const normalized = text
    .replace(/\r/g, "")
    .replace(/\s+(?=(?:אישיותית|מקצועית\s*\/\s*טכנולוגית|פערים|נקודות לבירור|שורה תחתונה|המלצה)\s*:)/g, "\n\n")
    .trim();
  let blocks = normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length === 1 && normalized.length > 420) {
    const sentences = normalized.match(/[^.!?]+[.!?]?/g)?.map((s) => s.trim()).filter(Boolean) || [normalized];
    blocks = [];
    for (let index = 0; index < sentences.length; index += 2)
      blocks.push(sentences.slice(index, index + 2).join(" "));
  }
  return (
    <div className="formatted-interview-summary">
      {blocks.map((block, index) => {
        const headingMatch = block.match(/^([^:\n]{2,45}):\s*(.*)$/s);
        if (headingMatch)
          return <section key={index}><h3>{headingMatch[1]}</h3>{headingMatch[2] && <p>{headingMatch[2]}</p>}</section>;
        return <p key={index}>{block}</p>;
      })}
    </div>
  );
}

function CandidatePage({
  c,
  applications,
  jobs,
  selectApplication,
  addApplication,
  back,
  save,
  archive,
  refresh,
  updateCandidate,
  editCandidate,
  removeCandidate,
}: {
  c: Candidate;
  applications: Candidate[];
  jobs: Job[];
  selectApplication: (a: Candidate) => void;
  addApplication: (jobId: number) => Promise<void>;
  back: () => void;
  save: (b: Record<string, unknown>) => Promise<void>;
  archive: () => void;
  refresh: () => Promise<void>;
  updateCandidate: (b: Record<string, unknown>) => Promise<void>;
  editCandidate: () => void;
  removeCandidate: () => void;
}) {
  const [tab, setTab] = useState("overview"),
    [summary, setSummary] = useState(c.interviewSummary),
    [saving, setSaving] = useState(false),
    [rawInterview, setRawInterview] = useState(""),
    [summaryDraft, setSummaryDraft] = useState(""),
    [summaryUncertainties, setSummaryUncertainties] = useState<string[]>([]),
    [summarizing, setSummarizing] = useState(false),
    [summaryMessage, setSummaryMessage] = useState(""),
    [addJobId, setAddJobId] = useState(0),
    [adding, setAdding] = useState(false),
    [editingNextAction, setEditingNextAction] = useState(false),
    [nextActionValue, setNextActionValue] = useState(c.nextAction),
    [nextActionDate, setNextActionDate] = useState(c.nextActionDate),
    [interviewDateValue, setInterviewDateValue] = useState(c.interview ? c.interview.slice(0, 16) : ""),
    [savingInterviewDate, setSavingInterviewDate] = useState(false);
  useEffect(
    () => setSummary(c.interviewSummary),
    [c.applicationId, c.interviewSummary],
  );
  useEffect(() => {
    setNextActionValue(c.nextAction);
    setNextActionDate(c.nextActionDate);
    setEditingNextAction(false);
  }, [c.applicationId, c.nextAction, c.nextActionDate]);
  useEffect(() => setInterviewDateValue(c.interview ? c.interview.slice(0, 16) : ""), [c.applicationId, c.interview]);
  async function saveSummary() {
    setSaving(true);
    try {
      await save({
        interviewSummary: summary,
      });
      setTab("evaluation");
    } finally {
      setSaving(false);
    }
  }
  async function createInterviewDraft() {
    setSummarizing(true);
    setSummaryMessage("");
    try {
      const response = await fetch("/api/interview/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: c.applicationId, rawText: rawInterview }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "יצירת הטיוטה נכשלה");
      setSummaryDraft(data.draft.summary || "");
      setSummaryUncertainties(data.draft.uncertainties || []);
      setSummaryMessage("הטיוטה מוכנה. אפשר לערוך אותה ורק לאחר מכן לאשר את העברתה לסיכום הראיון.");
      await refresh();
    } catch (error) {
      setSummaryMessage(error instanceof Error ? error.message : "יצירת הטיוטה נכשלה");
    } finally {
      setSummarizing(false);
    }
  }
  function approveInterviewDraft() {
    setSummary(summaryDraft);
    setSummaryDraft("");
    setSummaryUncertainties([]);
    setSummaryMessage("הטיוטה הועברה לשדה סיכום הראיון. בדוק אותה ולחץ על שמירה כדי לעדכן את המועמדות.");
  }
  async function addToJob() {
    if (!addJobId) return;
    setAdding(true);
    try {
      await addApplication(addJobId);
      setAddJobId(0);
    } finally {
      setAdding(false);
    }
  }
  async function changeStatus(nextStatus: string) {
    const warnings: string[] = [];
    if (nextStatus === "מיועד לראיון" && !c.interview) warnings.push("לא הוזנו תאריך ושעת ראיון");
    if (["ראיון בוצע", "עבר ראיון", "הועבר ללקוח", "בתהליך אצל הלקוח", "התקבל"].includes(nextStatus) && !c.interviewSummary)
      warnings.push("לא נשמר סיכום ראיון");
    if (nextStatus === "חדש" && c.cvTextLength > 0) warnings.push("כבר קיימים קורות חיים שחולצו");
    if (warnings.length && !confirm(`השינוי עלול ליצור חוסר התאמה:\n• ${warnings.join("\n• ")}\n\nלהמשיך בכל זאת?`)) return;
    await save({ status: nextStatus });
  }
  async function saveInterviewDate() {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(interviewDateValue)) return;
    setSavingInterviewDate(true);
    try { await save({ interviewDate: interviewDateValue }); }
    finally { setSavingInterviewDate(false); }
  }
  const hasInterview = Boolean(c.interviewSummary),
    existingJobIds = new Set(applications.map((a) => a.jobId)),
    availableJobs = jobs.filter((j) => !existingJobIds.has(j.id));
  return (
    <>
      <button className="crumb" onClick={back}>
        מועמדים / <b>{c.name}</b>
      </button>
      <section className="candidate-hero panel">
        <div className={`avatar hero-avatar ${c.color}`}>{c.initials}</div>
        <div className="hero-copy">
          <h1>{c.name}</h1>
          <p>{c.professionalTitle || "תפקיד מקצועי לא הוזן"}{c.company ? ` · ${c.company}` : ""}</p>
          <div className="contact">
            <span>✉ {c.email || "לא הוזן"}</span>
            <span>☎ {c.phone || "לא הוזן"}</span>
            <span>↗ {c.linkedin ? "LinkedIn" : "לא הוזן LinkedIn"}</span>
          </div>
        </div>
        <div className="hero-actions">
          <button className="secondary" onClick={editCandidate}>
            עריכת פרטי מועמד
          </button>
          <label>
            סטטוס במועמדות זו
            <select
              value={c.status}
              onChange={(e) => changeStatus(e.target.value)}
            >
              {[
                "חדש",
                "בבדיקה",
                "דורש בירור",
                "מיועד לראיון",
                "ראיון בוצע",
                "עבר ראיון",
                "הועבר ללקוח",
                "בתהליך אצל הלקוח",
                "התקבל",
                "נדחה",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <small>מתעדכן אוטומטית, וניתן לשינוי ידני</small>
          </label>
          <div className="interview-schedule-control">
            <label>תאריך ראיון<input type="date" value={interviewDateValue.split("T")[0] || ""} onChange={(e) => { const time = interviewDateValue.split("T")[1] || "09:00"; setInterviewDateValue(e.target.value ? `${e.target.value}T${time}` : ""); }} /></label>
            <label>שעה<input type="time" value={interviewDateValue.split("T")[1]?.slice(0, 5) || ""} onChange={(e) => { const date = interviewDateValue.split("T")[0]; setInterviewDateValue(date ? `${date}T${e.target.value}` : ""); }} /></label>
            <button className="secondary schedule-save" disabled={savingInterviewDate || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(interviewDateValue) || interviewDateValue === (c.interview ? c.interview.slice(0, 16) : "")} onClick={saveInterviewDate}>{savingInterviewDate ? "שומר..." : "✓ שמירת מועד"}</button>
            <small>אפשר לבחור או להקליד ידנית. השינוי נשמר רק בלחיצה.</small>
          </div>
          <button className="archive-button" onClick={archive}>
            ארכוב מועמדות
          </button>
          <button className="danger-text-button" onClick={removeCandidate}>
            מחיקת מועמד
          </button>
        </div>
      </section>
      <section className="applications-panel panel">
        <div className="applications-head">
          <div>
            <h2>מועמדויות</h2>
            <p>לכל משרה נשמרים בנפרד הסטטוס, הראיון והערכת ה-AI.</p>
          </div>
          {availableJobs.length > 0 && (
            <div className="add-application">
              <select
                value={addJobId}
                onChange={(e) => setAddJobId(Number(e.target.value))}
              >
                <option value="0">בחירת משרה נוספת...</option>
                {availableJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} · {j.client}
                  </option>
                ))}
              </select>
              <button
                className="secondary"
                disabled={!addJobId || adding}
                onClick={addToJob}
              >
                {adding ? "מוסיף..." : "הוספה למשרה"}
              </button>
            </div>
          )}
        </div>
        <div className="application-cards">
          {applications.map((a) => (
            <button
              key={a.applicationId}
              className={a.applicationId === c.applicationId ? "active" : ""}
              onClick={() => selectApplication(a)}
            >
              <span>{a.role}</span>
              <small>{a.client}</small>
              <div>
                <em className={`pill ${statusClass(a.status)}`}>{a.status}</em>
                {a.score === null ? <b>טרם הוערך</b> : <b>ציון {a.score}</b>}
              </div>
            </button>
          ))}
        </div>
      </section>
      <div className="tabs">
        {[
          ["overview", "סקירה"],
          ["cv", "קורות חיים"],
          ["interview", "סיכום ראיון"],
          ["evaluation", "הערכת AI"],
        ].map(([k, l]) => (
          <button
            key={k}
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <div className="candidate-grid">
          <div className="candidate-main">
            <section className="panel content-card">
              <h2>תקציר מועמד</h2>
              <p>{c.summary || "טרם הוזן תקציר מועמד."}</p>
              <div className="info-grid">
                <div>
                  <span>תפקיד מקצועי</span>
                  <b>{c.professionalTitle || "לא הוזן"}</b>
                </div>
                <div>
                  <span>חברה</span>
                  <b>{c.company || "לא הוזן"}</b>
                </div>
                <div>
                  <span>שנות ניסיון</span>
                  <b>{c.years || "לא ידוע"}</b>
                </div>
                <div>
                  <span>מועמדות נוכחית</span>
                  <b>{c.role} · {c.client}</b>
                </div>
              </div>
              <h3>טכנולוגיות</h3>
              <div className="tags">
                {c.tech.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </section>
            <section className="panel content-card">
              <div className="panel-head">
                <h2>סיכום ראיון</h2>
                <button
                  className="text-button"
                  onClick={() => setTab("interview")}
                >
                  {hasInterview ? "פתיחה ועריכה" : "הוספת סיכום"}
                </button>
              </div>
              {hasInterview ? (
                <>
                  <ReadableInterviewSummary text={c.interviewSummary} />
                  <small className="updated">הראיון בוצע</small>
                </>
              ) : (
                <div className="empty-inline">
                  <b>טרם הוזן סיכום ראיון</b>
                  <span>לאחר הראיון ניתן להדביק כאן את הסיכום החופשי.</span>
                </div>
              )}
            </section>
          </div>
          <aside className="candidate-side">
            <section className="panel evaluation-summary">
              {c.score === null ? (
                <div className="empty-inline">
                  <b>טרם בוצעה הערכת AI</b>
                  <span>ההערכה תופעל לאחר הוספת קורות חיים.</span>
                </div>
              ) : (
                <>
                  <div className="eval-head">
                    <div>
                      <span>ציון התאמה</span>
                      <strong>{c.score}</strong>
                      <small>מתוך 100</small>
                    </div>
                    <div
                      className="score-ring"
                      style={
                        {
                          "--score": `${c.score * 3.6}deg`,
                        } as React.CSSProperties
                      }
                    >
                      <i>{c.score}</i>
                    </div>
                  </div>
                  <div
                    className={`big-recommend ${statusClass(c.recommendation)}`}
                  >
                    ● {c.recommendation}
                  </div>
                  <div className="evaluation-source">
                    <b>הערכה {c.evaluationType}</b>
                    <span>
                      מבוססת על: דרישות המשרה + קורות חיים
                      {c.evaluationType === "לאחר ראיון" ? " + סיכום ראיון" : ""}
                    </span>
                  </div>
                  <button
                    className="ai-button"
                    onClick={() => setTab("evaluation")}
                  >
                    ✦ צפייה בהערכה המלאה
                  </button>
                  <small className="updated center">
                    נוצרה: {formatDate(c.evaluationDate)}
                  </small>
                </>
              )}
            </section>
            <section className="panel next-action">
              <h2>הפעולה הבאה</h2>
              <span>משימה קונקרטית למועמדות הזו. היא תופיע גם בלוח הבקרה.</span>
              <b>{c.nextAction || "לא הוגדרה פעולה"}</b>
              {c.nextActionDate && <span>{formatDate(c.nextActionDate)}</span>}
              {!editingNextAction ? (
                <button className="secondary" onClick={() => setEditingNextAction(true)}>
                  {c.nextAction ? "עריכת המשימה" : "הגדרת משימה"}
                </button>
              ) : (
                <div className="next-action-editor">
                  <label>מה צריך לעשות?</label>
                  <input list="next-action-suggestions" value={nextActionValue} onChange={(event) => setNextActionValue(event.target.value)} placeholder="לדוגמה: תיאום ראיון מקצועי" />
                  <datalist id="next-action-suggestions">
                    <option value="הפעלת הערכה לפני ראיון" />
                    <option value="תיאום ראיון מקצועי" />
                    <option value="ביצוע ראיון מקצועי" />
                    <option value="הפעלת הערכה לאחר ראיון" />
                    <option value="העברה ללקוח" />
                    <option value="מעקב מול הלקוח" />
                  </datalist>
                  <label>תאריך יעד, לא חובה</label>
                  <input type="date" value={nextActionDate ? nextActionDate.slice(0, 10) : ""} onChange={(event) => setNextActionDate(event.target.value)} />
                  <div className="next-action-buttons">
                    <button className="text-button" onClick={() => setEditingNextAction(false)}>ביטול</button>
                    <button className="secondary" onClick={async () => { await save({ nextAction: "", nextActionDate: null }); setEditingNextAction(false); }}>ניקוי משימה</button>
                    <button className="primary" disabled={!nextActionValue.trim()} onClick={async () => { await save({ nextAction: nextActionValue.trim(), nextActionDate: nextActionDate || null }); setEditingNextAction(false); }}>שמירה</button>
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>
      )}
      {tab === "cv" && (
        <CvPanel c={c} refresh={refresh} updateCandidate={updateCandidate} onApproved={() => save({ nextAction: "הפעלת הערכת התאמה ראשונית" })} />
      )}
      {tab === "interview" && (
        <div className="interview-workspace">
          <section className="panel editor-panel raw-interview-panel">
            <h2>יצירת סיכום מחומר גלם באמצעות AI</h2>
            <p>הדבק תמלול Teams, הערות חופשיות או שילוב שלהם. ה-AI יכין טיוטה בלבד ולא ישנה את הסיכום המאושר ללא אישורך.</p>
            <textarea value={rawInterview} onChange={(e) => setRawInterview(e.target.value)} placeholder="הדבק כאן את חומר הגלם מהראיון..." />
            <div className="editor-actions">
              <button className="ai-button inline-ai" disabled={summarizing || rawInterview.trim().length < 50} onClick={createInterviewDraft}>
                {summarizing ? "מכין טיוטה..." : "יצירת טיוטת סיכום באמצעות AI"}
              </button>
            </div>
            {summaryMessage && <p className="interview-message">{summaryMessage}</p>}
          </section>
          {summaryDraft && (
            <section className="panel editor-panel interview-draft-panel">
              <h2>טיוטה לבדיקתך</h2>
              <p>אפשר לתקן את הנוסח לפני האישור. רק הכפתור למטה יעביר אותו לשדה סיכום הראיון.</p>
              {summaryUncertainties.length > 0 && <div className="draft-warning"><b>נקודות שה-AI לא הצליח לקבוע בוודאות</b><ul>{summaryUncertainties.map((item) => <li key={item}>{item}</li>)}</ul></div>}
              <textarea value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)} />
              <div className="editor-actions">
                <button className="secondary" onClick={() => { setSummaryDraft(""); setSummaryUncertainties([]); }}>ביטול הטיוטה</button>
                <button className="primary" onClick={approveInterviewDraft}>אישור והעברה לסיכום הראיון</button>
              </div>
            </section>
          )}
          <section className="panel editor-panel approved-interview-panel">
            <h2>סיכום ראיון מאושר</h2>
            <p>זהו המידע שיישמר במועמדות וישמש את הערכת ההתאמה. אפשר גם לכתוב או לערוך אותו ידנית.</p>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="טרם הוזן סיכום ראיון..." />
            <div className="editor-actions">
              <button className="secondary" onClick={() => setSummary(c.interviewSummary)}>ביטול שינויים</button>
              <button className="primary" disabled={saving} onClick={saveSummary}>{saving ? "שומר..." : "שמירה ומעבר להערכת AI"}</button>
            </div>
          </section>
        </div>
      )}
      {tab === "evaluation" && <Evaluation c={c} refresh={refresh} />}
    </>
  );
}
type ParsedDetails = {
  fullName: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  professionalTitle: string;
  company: string;
  yearsExperience: number;
  technologies: string[];
  experienceSummary: string;
  notes: { professionalTitle: string; company: string; years: string; summary: string };
};
function CvPanel({
  c,
  refresh,
  updateCandidate,
  onApproved,
}: {
  c: Candidate;
  refresh: () => Promise<void>;
  updateCandidate: (b: Record<string, unknown>) => Promise<void>;
  onApproved: () => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false),
    [parsing, setParsing] = useState(false),
    [parsingMode, setParsingMode] = useState<"quick" | "ai" | null>(null),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [details, setDetails] = useState<ParsedDetails | null>(null),
    [recruiterOpinion, setRecruiterOpinion] = useState(c.recruiterOpinion || ""),
    [savingOpinion, setSavingOpinion] = useState(false);
  useEffect(() => setRecruiterOpinion(c.recruiterOpinion || ""), [c.id, c.recruiterOpinion]);
  async function saveRecruiterOpinion() {
    setSavingOpinion(true);
    setMessage("");
    try {
      await updateCandidate({ recruiterOpinion });
      setMessage("חוות דעת המגייס נשמרה בתיק המועמד ותיכלל בהערכות הבאות");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "שמירת חוות הדעת נכשלה");
    } finally {
      setSavingOpinion(false);
    }
  }
  async function loadDetails(useAi = false) {
    setParsing(true);
    setParsingMode(useAi ? "ai" : "quick");
    setMessage("");
    try {
      const r = useAi
        ? await fetch("/api/cv/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId: c.applicationId }) })
        : await fetch(`/api/cv?applicationId=${c.applicationId}&mode=details`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "ניתוח הפרטים נכשל");
      setDetails(d.details);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "ניתוח הפרטים נכשל");
    } finally {
      setParsing(false);
      setParsingMode(null);
    }
  }
  async function upload(file: File) {
    setUploading(true);
    setMessage("");
    setDetails(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("applicationId", String(c.applicationId));
      const r = await fetch("/api/cv", { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "העלאת הקובץ נכשלה");
      setMessage(d.extractionStatus);
      await refresh();
      if (d.textLength) await loadDetails(false);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "העלאת הקובץ נכשלה");
    } finally {
      setUploading(false);
    }
  }
  async function approve(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!details) return;
    setSaving(true);
    try {
      await updateCandidate(details);
      await onApproved();
      setMessage("הפרטים אושרו ונשמרו בכרטיס המועמד");
      setDetails(null);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "שמירת הפרטים נכשלה");
    } finally {
      setSaving(false);
    }
  }
  function field<K extends keyof ParsedDetails>(
    key: K,
    value: ParsedDetails[K],
  ) {
    setDetails((prev) => (prev ? { ...prev, [key]: value } : prev));
  }
  return (
    <section className="panel cv-panel">
      <div className="cv-head">
        <div>
          <h2>קורות חיים</h2>
          <p>
            PDF בלבד, עד 10MB. לאחר החילוץ יש לבדוק ולאשר את הפרטים לפני עדכון
            הכרטיס.
          </p>
        </div>
        <label
          className={`primary upload-button ${uploading ? "disabled" : ""}`}
        >
          {uploading
            ? "מעלה ומחלץ טקסט..."
            : c.cvFilename
              ? "החלפת PDF"
              : "העלאת PDF"}
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
        </label>
      </div>
      {c.cvFilename ? (
        <>
          <div className="cv-file">
            <div className="pdf-icon">PDF</div>
            <div className="cv-file-copy">
              <b>{c.cvFilename}</b>
              <span>
                {formatBytes(c.cvSize)}
                {c.cvPages ? ` · ${c.cvPages} עמודים` : ""} · הועלה{" "}
                {formatDate(c.cvUploadedAt)}
              </span>
              <small
                className={c.cvTextLength ? "extracted" : "needs-attention"}
              >
                {c.cvStatus}
                {c.cvTextLength
                  ? ` · ${c.cvTextLength.toLocaleString("he-IL")} תווים`
                  : ""}
              </small>
            </div>
            <a
              className="secondary"
              href={`/api/cv?applicationId=${c.applicationId}`}
              target="_blank"
              rel="noreferrer"
            >
              פתיחת הקובץ
            </a>
            <button
              className="secondary"
              disabled={!c.cvTextLength || parsing}
              onClick={() => loadDetails(false)}
            >
              {parsingMode === "quick" ? "מחלץ..." : "חילוץ מהיר ללא AI"}
            </button>
            <button
              className="primary"
              disabled={!c.cvTextLength || parsing}
              onClick={() => loadDetails(true)}
            >
              {parsingMode === "ai" ? "מנתח באמצעות AI..." : "✦ חילוץ חכם באמצעות AI"}
            </button>
          </div>
          {details && (
            <form className="parsed-card" onSubmit={approve}>
              <div className="parsed-title">
                <div>
                  <h3>אימות פרטים שחולצו</h3>
                  <p>המערכת לא תשנה דבר עד שתאשר. ערוך כל שדה שאינו מדויק.</p>
                </div>
                <span>דורש אימות אנושי</span>
              </div>
              <div className="parsed-grid">
                <label>
                  שם מלא
                  <input
                    value={details.fullName}
                    onChange={(e) => field("fullName", e.target.value)}
                  />
                </label>
                <label>
                  דוא״ל
                  <input
                    type="email"
                    value={details.email}
                    onChange={(e) => field("email", e.target.value)}
                  />
                </label>
                <label>
                  טלפון
                  <input
                    value={details.phone}
                    onChange={(e) => field("phone", e.target.value)}
                  />
                </label>
                <label>
                  LinkedIn
                  <input
                    value={details.linkedinUrl}
                    onChange={(e) => field("linkedinUrl", e.target.value)}
                  />
                </label>
                <label>
                  תפקיד מקצועי נוכחי / אחרון
                  <input
                    value={details.professionalTitle}
                    onChange={(e) => field("professionalTitle", e.target.value)}
                  />
                  <small>{details.notes.professionalTitle}</small>
                </label>
                <label>
                  חברה נוכחית / אחרונה
                  <input
                    value={details.company}
                    onChange={(e) => field("company", e.target.value)}
                  />
                  <small>{details.notes.company}</small>
                </label>
                <label>
                  שנות ניסיון
                  <input
                    type="number"
                    min="0"
                    value={details.yearsExperience || ""}
                    onChange={(e) =>
                      field("yearsExperience", Number(e.target.value || 0))
                    }
                  />
                  <small>{details.notes.years}</small>
                </label>
                <label className="wide">
                  טכנולוגיות, מופרדות בפסיקים
                  <input
                    value={details.technologies.join(", ")}
                    onChange={(e) =>
                      field(
                        "technologies",
                        e.target.value
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                </label>
                <label className="wide">
                  תקציר ניסיון מוצע
                  <textarea
                    value={details.experienceSummary}
                    onChange={(e) => field("experienceSummary", e.target.value)}
                  />
                  <small>{details.notes.summary}</small>
                </label>
              </div>
              <div className="parsed-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setDetails(null)}
                >
                  ביטול
                </button>
                <button className="primary" disabled={saving}>
                  {saving ? "שומר..." : "אישור ועדכון הכרטיס"}
                </button>
              </div>
            </form>
          )}
        </>
      ) : (
        <div className="cv-empty">
          <span>▤</span>
          <b>טרם הועלו קורות חיים</b>
          <p>בחר קובץ PDF. לאחר ההעלאה המערכת תשמור אותו ותחלץ ממנו טקסט.</p>
        </div>
      )}
      <section className="recruiter-opinion">
        <div>
          <h3>חוות דעת מגייס מהראיון הראשוני</h3>
          <p>הדבק כאן את סיכום המגייס, מידע עובדתי והתרשמות רלוונטית. המידע נשמר בתיק המועמד ומשמש מקור משלים בהערכות AI עתידיות.</p>
        </div>
        <textarea value={recruiterOpinion} onChange={(e) => setRecruiterOpinion(e.target.value)} placeholder="הדבק כאן את חוות דעת המגייס..." />
        <div className="editor-actions">
          <button className="secondary" disabled={savingOpinion || recruiterOpinion === c.recruiterOpinion} onClick={() => setRecruiterOpinion(c.recruiterOpinion || "")}>ביטול שינויים</button>
          <button className="primary" disabled={savingOpinion || recruiterOpinion === c.recruiterOpinion} onClick={saveRecruiterOpinion}>{savingOpinion ? "שומר..." : "שמירת חוות דעת"}</button>
        </div>
      </section>
      {message && (
        <div
          className={`cv-message ${message.includes("נכשל") || message.includes("לא נמצא") ? "error" : "success"}`}
        >
          {message}
        </div>
      )}
      <div className="privacy-note">
        <b>חשוב:</b> זיהוי אנשי קשר וטכנולוגיות הוא אוטומטי. חברה, ותק ותקציר
        עלולים לדרוש תיקון. שיוך למשרה לעולם אינו משתנה מה-CV.
      </div>
    </section>
  );
}
function Evaluation({
  c,
  refresh,
}: {
  c: Candidate;
  refresh: () => Promise<void>;
}) {
  const [running, setRunning] = useState(false),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState(c.evaluationFeedback || ""),
    [feedbackSent, setFeedbackSent] = useState(false),
    [ruleUpdating, setRuleUpdating] = useState(false);
  const e = c.evaluation;
  useEffect(() => {
    setFeedback(c.evaluationFeedback || "");
    setFeedbackSent(false);
  }, [c.applicationId]);
  const sources = `דרישות המשרה + קורות חיים${c.recruiterOpinion ? " + חוות דעת מגייס" : ""}${(!e ? c.interviewSummary : c.evaluationType === "לאחר ראיון") ? " + סיכום ראיון מקצועי" : ""}`;
  const needsFinalEvaluation = Boolean(e && c.interviewSummary && c.evaluationType !== "לאחר ראיון");
  async function run(reviewerFeedback = "") {
    setRunning(true);
    setError("");
    try {
      const r = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: c.applicationId, reviewerFeedback }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "הערכת המועמד נכשלה");
      setFeedbackSent(Boolean(reviewerFeedback.trim()));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "הערכת המועמד נכשלה");
    } finally {
      setRunning(false);
    }
  }
  async function decideRule(decision: "approve" | "reject") {
    setRuleUpdating(true);
    setError("");
    try {
      const r = await fetch("/api/recruiting", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "application",
          id: c.applicationId,
          engineRuleDecision: decision,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "עדכון הכלל נכשל");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "עדכון הכלל נכשל");
    } finally {
      setRuleUpdating(false);
    }
  }
  if (!e)
    return (
      <div className="evaluation-page">
        <section className="panel evaluation-empty">
          <span>✦</span>
          <h2>{c.interviewSummary ? "הערכת מועמד לאחר ראיון באמצעות AI" : "הערכת התאמה לפני ראיון באמצעות AI"}</h2>
          <p>
            המערכת תנתח את דרישות המשרה, קורות החיים
            {c.recruiterOpinion ? ", חוות דעת המגייס" : ""}
            {c.interviewSummary ? " וסיכום הראיון המקצועי" : ""} לפי הוראות ״בודק התאמת
            מועמדים״.
          </p>
          <div className="evaluation-source wide-source">
            <b>מקורות שיועברו לניתוח</b>
            <span>{sources}</span>
          </div>
          <button
            className="primary"
            disabled={running || !c.cvTextLength}
            onClick={() => run()}
          >
            {running ? "מנתח את ההתאמה..." : c.interviewSummary ? "הפעלת הערכה לאחר ראיון" : "הפעלת הערכה לפני ראיון"}
          </button>
          {!c.cvTextLength && (
            <small>יש להעלות קורות חיים ולחלץ מהם טקסט תחילה.</small>
          )}
          {error && <div className="cv-message error">{error}</div>}
        </section>
      </div>
    );
  const recruitmentEmail = c.evaluationType === "לאחר ראיון"
    ? e.recruitment_email
    : e.recruitment_email.replace(/\n*שינויים מומלצים בקורות החיים[\s\S]*$/u, "").trim();
  return (
    <div className="evaluation-page">
      {needsFinalEvaluation && (
        <div className="cv-message needs-final-evaluation">
          סיכום הראיון נשמר, אך ההערכה המוצגת עדיין ראשונית. לחץ „הערכה מחדש” כדי להפיק הערכה סופית הכוללת את הראיון.
        </div>
      )}
      <section className="panel evaluation-banner">
        <div>
          <span>ציון התאמה</span>
          <strong>
            {e.score}
            <small> / 100</small>
          </strong>
        </div>
        <div>
          <span>שורה תחתונה</span>
          <b>{e.fit_label}</b>
        </div>
        <div>
          <span>המלצה</span>
          <b>{e.recommendation}</b>
        </div>
        <div>
          <span>סוג הערכה</span>
          <b>{c.evaluationType}</b>
        </div>
        <button className="secondary" disabled={running} onClick={() => run()}>
          {running ? "מעדכן..." : "הערכה מחדש"}
        </button>
      </section>
      {error && <div className="cv-message error">{error}</div>}
      <section className="panel bottom-line">
        <span>שורה תחתונה</span>
        <p>{e.bottom_line}</p>
      </section>
      <section className="panel content-card">
        <h2>תקציר מנהלים</h2>
        <p>{e.executive_summary}</p>
        <div className="evaluation-source">
          <b>מקורות המידע</b>
          <span>
            {sources} · נוצרה {formatDate(c.evaluationDate)}
          </span>
        </div>
      </section>
      {e.gate_status !== "לא רלוונטי לתפקיד" && (
        <>
          <div className="eval-columns">
            <section className="panel content-card">
              <h2 className="green-title">במה הוא מתאים</h2>
              <div className="evidence-list">
                {e.strengths.map((x, i) => (
                  <article key={i}>
                    <b>{x.requirement}</b>
                    <p>{x.evidence}</p>
                    <span>{x.assessment}</span>
                  </article>
                ))}
              </div>
            </section>
            <section className="panel content-card">
              <h2 className="orange-title">פערים</h2>
              <div className="evidence-list gaps-list">
                {e.gaps.map((x, i) => (
                  <article key={i}>
                    <b>{x.requirement}</b>
                    <p>
                      <strong>מה יש:</strong> {x.candidate_has}
                    </p>
                    <p>
                      <strong>מה חסר:</strong> {x.missing}
                    </p>
                    <span>
                      קריטיות: {x.criticality} · {x.completion_likelihood}
                    </span>
                  </article>
                ))}
              </div>
            </section>
          </div>
          <div className="eval-columns">
            <section className="panel content-card">
              <h2>מה לא ברור וחייבים לברר</h2>
              <ul>
                {e.uncertainties.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
              <h3>סיכונים</h3>
              <ul>
                {e.risks.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
            <section className="panel content-card">
              <h2>התאמה מקצועית</h2>
              <h3>טכנולוגיות</h3>
              <p>{e.technology_fit}</p>
              <h3>ניסיון ו-Seniority</h3>
              <p>{e.experience_fit}</p>
            </section>
          </div>
          {e.questions.length > 0 && (
            <section className="panel content-card">
              <h2>שאלות לראיון</h2>
              <div className="question-cards">
                {e.questions.map((q, i) => (
                  <article key={i}>
                    <h3>
                      {i + 1}. {q.question}
                    </h3>
                    <p>
                      <b>למה אני שואל:</b> {q.why}
                    </p>
                    <p>
                      <b>תשובה טובה שאני מחפש:</b> {q.good_answer}
                    </p>
                    <p>
                      <b>דגל אדום:</b> {q.red_flag}
                    </p>
                    <p>
                      <b>הסבר בשבילי:</b> {q.interviewer_explanation}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {c.evaluationType === "לאחר ראיון" && e.cv_changes_needed && e.cv_change_recommendations?.length > 0 && (
        <section className="panel content-card cv-changes-card">
          <h2>שינויים מומלצים בקורות החיים לפני העברה ללקוח</h2>
          <p>רק שינויים המבוססים על מידע שכבר קיים בקורות החיים, בראיון או במשוב שלך.</p>
          <div className="cv-change-list">
            {e.cv_change_recommendations.map((change, index) => (
              <article key={index}>
                <b>{change.location}</b>
                <p><strong>מה לשנות או להוסיף:</strong> {change.change}</p>
                <p><strong>למה:</strong> {change.reason}</p>
                <small>בסיס עובדתי: {change.evidence}</small>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="panel content-card recruitment-mail">
        <h2>{c.evaluationType === "לאחר ראיון" ? "מייל לגיוס - החלטה על העברה ללקוח" : "מייל לגיוס - החלטה על זימון לראיון"}</h2>
        <p className="mail-purpose">{c.evaluationType === "לאחר ראיון" ? "המייל חייב להנחות במפורש אם להעביר את המועמד ללקוח המגייס או לא. ההחלטה המקצועית אינה מועברת לצוות הגיוס." : "המייל מסכם אם לזמן את המועמד לראיון מקצועי ומה חשוב לבדוק בו."}</p>
        <pre>{recruitmentEmail}</pre>
        <button
          className="secondary"
          onClick={() => navigator.clipboard.writeText(recruitmentEmail)}
        >
          העתקת המייל
        </button>
      </section>
      <section className="panel content-card evaluation-feedback">
        <h2>משוב ותיקונים להערכת ה-AI</h2>
        <p>
          אם לדעתך ההערכה החמירה מדי, פספסה ניסיון רלוונטי או נתנה משקל לא נכון
          לדרישה מסוימת, כתוב כאן את התיקון. המערכת תפיק הערכה חדשה למועמדות הזאת בלבד.
        </p>
        <textarea
          value={feedback}
          onChange={(event) => {
            setFeedback(event.target.value);
            setFeedbackSent(false);
          }}
          placeholder="לדוגמה: ניסיון הניהול שלו מוכח גם ללא מספר שנים מדויק. יש לתת משקל גבוה יותר לניסיון בהקמה, קינפוג וניטור Kafka על Kubernetes."
        />
        <div className="feedback-actions">
          <small>המשוב נשמר יחד עם ההערכה המעודכנת ואינו משנה את כללי המערכת עבור מועמדים אחרים.</small>
          <button
            className="primary"
            disabled={running || !feedback.trim()}
            onClick={() => run(feedback)}
          >
            {running ? "מפיק הערכה מעודכנת..." : "שליחת משוב והפקת הערכה חדשה"}
          </button>
        </div>
        {feedbackSent && <div className="cv-message success">המשוב נשלח וההערכה עודכנה.</div>}
      </section>
      {c.proposedEngineRule && c.engineRuleStatus !== "ללא הצעה" && (
        <section className="panel content-card engine-rule-card">
          <h2>הצעה לשיפור רוחבי של מנוע ההערכה</h2>
          <p>{c.proposedEngineRule}</p>
          {c.engineRuleStatus === "ממתין לאישור" ? (
            <div className="feedback-actions">
              <small>רק אישור שלך יהפוך את ההצעה לכלל קבוע בהערכות הבאות.</small>
              <div className="rule-buttons">
                <button className="secondary" disabled={ruleUpdating} onClick={() => decideRule("reject")}>דחייה</button>
                <button className="primary" disabled={ruleUpdating} onClick={() => decideRule("approve")}>אישור ככלל קבוע</button>
              </div>
            </div>
          ) : (
            <span className={`pill ${c.engineRuleStatus.includes("אושר") ? "success" : "neutral"}`}>{c.engineRuleStatus}</span>
          )}
        </section>
      )}
    </div>
  );
}

function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section className="modal panel">
        <div className="modal-head">
          <h2>{title}</h2>
          <button onClick={close}>×</button>
        </div>
        {children}
      </section>
    </div>
  );
}
type JobDraft = {
  title: string;
  client: string;
  description: string;
  mustRequirements: string;
  preferredRequirements: string;
  technologies: string[];
  minYears: number | null;
  professionalEmphasis: string;
  personalityEmphasis: string;
  internalNotes: string;
  uncertainties: string[];
};
type JobRefinement = {
  summary: string;
  changes: { field: string; action: string; reason: string }[];
  questions: string[];
  draft: Omit<JobDraft, "uncertainties">;
};
function JobForm({
  job,
  close,
  save,
}: {
  job?: Job;
  close: () => void;
  save: (b: Record<string, unknown>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [parsing, setParsing] = useState(false),
    [mode, setMode] = useState<"manual" | "import" | "refine">("manual"),
    [raw, setRaw] = useState(""),
    [parseError, setParseError] = useState(""),
    [warnings, setWarnings] = useState<string[]>([]),
    [refinement, setRefinement] = useState<JobRefinement | null>(null);
  const [draft, setDraft] = useState<JobDraft>({
    title: job?.title || "",
    client: job?.client || "",
    description: job?.description || "",
    mustRequirements: job?.must || "",
    preferredRequirements: job?.preferred || "",
    technologies: job?.tech || [],
    minYears: job?.minYears ?? null,
    professionalEmphasis: job?.emphasis || "",
    personalityEmphasis: job?.personality || "",
    internalNotes: job?.notes || "",
    uncertainties: [],
  });
  const set = (key: keyof JobDraft, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  async function parseRaw() {
    setParsing(true);
    setParseError("");
    try {
      const r = await fetch("/api/jobs/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: raw }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "החילוץ נכשל");
      setDraft(d.draft);
      setWarnings(d.draft.uncertainties || []);
      setMode("manual");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "החילוץ נכשל");
    } finally {
      setParsing(false);
    }
  }
  async function refineJob() {
    setParsing(true);
    setParseError("");
    setRefinement(null);
    try {
      const r = await fetch("/api/jobs/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: raw, job: { id: job?.id, ...draft } }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "ניתוח העדכון נכשל");
      setRefinement(d.refinement);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "ניתוח העדכון נכשל");
    } finally {
      setParsing(false);
    }
  }
  async function approveRefinement() {
    if (!refinement) return;
    setBusy(true);
    try {
      await save({ ...refinement.draft, status: job?.status || "פעילה" });
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await save({
        title: draft.title,
        client: draft.client,
        status: new FormData(e.currentTarget).get("status"),
        description: draft.description,
        mustRequirements: draft.mustRequirements,
        preferredRequirements: draft.preferredRequirements,
        technologies: draft.technologies,
        minYears: draft.minYears,
        professionalEmphasis: draft.professionalEmphasis,
        personalityEmphasis: draft.personalityEmphasis,
        internalNotes: draft.internalNotes,
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={job ? "עריכת משרה" : "משרה חדשה"} close={close}>
      <div className="job-form-tabs">
        <button
          type="button"
          className={mode === "manual" ? "active" : ""}
          onClick={() => setMode("manual")}
        >
          מילוי ובדיקת הטיוטה
        </button>
        {!job && (
          <button
            type="button"
            className={mode === "import" ? "active" : ""}
            onClick={() => setMode("import")}
          >
            ✦ יצירה מטקסט חופשי
          </button>
        )}
        {job && (
          <button
            type="button"
            className={mode === "refine" ? "active" : ""}
            onClick={() => setMode("refine")}
          >
            ✦ עדכון באמצעות AI
          </button>
        )}
      </div>
      {mode === "refine" ? (
        <div className="job-import job-refine">
          <div className="import-intro">
            <b>עדכון המשרה לפי מידע חדש</b>
            <span>הדבק תמלול שיחה, מייל או הבהרות מהמנהל המגייס. ה-AI יציג מה הוא מציע לשנות, ורק אישור שלך יעדכן וישמור את המשרה.</span>
          </div>
          {!refinement ? (
            <>
              <textarea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="הדבק כאן את התמלול או ההבהרות החדשות..." autoFocus />
              <div className="privacy-note">הטקסט יישלח ל-OpenAI לצורך השוואה מול פרטי המשרה. אל תכלול מידע אישי שאינו נחוץ.</div>
              {parseError && <div className="cv-message error">{parseError}</div>}
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setMode("manual")}>חזרה לעריכה</button>
                <button type="button" className="primary" disabled={parsing || raw.trim().length < 20} onClick={refineJob}>{parsing ? "מנתח את המידע..." : "✦ ניתוח והצעת שינויים"}</button>
              </div>
            </>
          ) : (
            <div className="refinement-report">
              <div className="refinement-summary"><b>סיכום הניתוח</b><p>{refinement.summary}</p></div>
              <div>
                <h3>שינויים מוצעים ({refinement.changes.length})</h3>
                {refinement.changes.length ? <div className="refinement-changes">{refinement.changes.map((change, i) => <article key={i}><b>{change.field}</b><p>{change.action}</p><small>{change.reason}</small></article>)}</div> : <p className="muted-line">לא נמצאו שינויים מוצדקים במשרה.</p>}
              </div>
              {refinement.questions.length > 0 && <div className="draft-warning"><b>נקודות שדורשות בירור ולא שונו אוטומטית</b><ul>{refinement.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>}
              <div className="form-actions">
                <button type="button" className="secondary" disabled={busy} onClick={() => setRefinement(null)}>חזרה ועריכת הטקסט</button>
                <button type="button" className="primary" disabled={busy || refinement.changes.length === 0} onClick={approveRefinement}>{busy ? "מעדכן ושומר..." : "אישור, עדכון ושמירת המשרה"}</button>
              </div>
            </div>
          )}
        </div>
      ) : mode === "import" ? (
        <div className="job-import">
          <div className="import-intro">
            <b>הדבק את כל החומר כפי שקיבלת</b>
            <span>
              אפשר להדביק שרשור מיילים, תיאור רשמי, הערות מנהל ודגשים מקצועיים.
              המערכת לא תשמור דבר לפני שתבדוק ותאשר.
            </span>
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="הדבק כאן את תיאור המשרה, ההתכתבות והדגשים..."
            autoFocus
          />
          <div className="privacy-note">
            הטקסט יישלח ל-OpenAI לצורך ארגון המשרה. אל תכלול מידע אישי שאינו
            נחוץ.
          </div>
          {parseError && <div className="cv-message error">{parseError}</div>}
          <div className="form-actions">
            <button type="button" className="secondary" onClick={close}>
              ביטול
            </button>
            <button
              type="button"
              className="primary"
              disabled={parsing || raw.trim().length < 20}
              onClick={parseRaw}
            >
              {parsing ? "מארגן את המשרה..." : "✦ יצירת טיוטת משרה"}
            </button>
          </div>
        </div>
      ) : (
        <form className="form-grid" onSubmit={submit}>
          {warnings.length > 0 && (
            <div className="draft-warning wide">
              <b>נדרש להשלים או לאמת</b>
              <ul>
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <label>
            שם המשרה
            <input
              required
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </label>
          <label>
            לקוח
            <input
              required
              value={draft.client}
              onChange={(e) => set("client", e.target.value)}
            />
          </label>
          <label>
            סטטוס
            <select name="status" defaultValue={job?.status || "פעילה"}>
              <option>פעילה</option>
              <option>בהשהיה</option>
              <option>סגורה</option>
            </select>
          </label>
          <label>
            שנות ניסיון מינימליות
            <input
              type="number"
              min="0"
              value={draft.minYears ?? ""}
              onChange={(e) =>
                set(
                  "minYears",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </label>
          <label className="wide">
            תיאור המשרה
            <textarea
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </label>
          <label className="wide">
            דרישות חובה
            <textarea
              value={draft.mustRequirements}
              onChange={(e) => set("mustRequirements", e.target.value)}
            />
          </label>
          <label className="wide">
            דרישות יתרון
            <textarea
              value={draft.preferredRequirements}
              onChange={(e) => set("preferredRequirements", e.target.value)}
            />
          </label>
          <label className="wide">
            טכנולוגיות, מופרדות בפסיקים
            <input
              value={draft.technologies.join(", ")}
              onChange={(e) =>
                set(
                  "technologies",
                  e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                )
              }
            />
          </label>
          <label className="wide">
            דגשים מקצועיים
            <textarea
              value={draft.professionalEmphasis}
              onChange={(e) => set("professionalEmphasis", e.target.value)}
            />
          </label>
          <label className="wide">
            דגשים אישיותיים
            <textarea
              value={draft.personalityEmphasis}
              onChange={(e) => set("personalityEmphasis", e.target.value)}
            />
          </label>
          <label className="wide">
            הערות פנימיות
            <textarea
              value={draft.internalNotes}
              onChange={(e) => set("internalNotes", e.target.value)}
            />
          </label>
          <div className="form-actions wide">
            <button type="button" className="secondary" onClick={close}>
              ביטול
            </button>
            {!job && (
              <button
                type="button"
                className="secondary"
                onClick={() => setMode("import")}
              >
                חזרה לטקסט המקורי
              </button>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "שומר..." : "שמירת המשרה"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
function CandidateForm({
  jobs,
  initialJobId,
  close,
  save,
}: {
  jobs: Job[];
  initialJobId: number | null;
  close: () => void;
  save: (b: Record<string, unknown>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    await save({
      fullName: f.get("name"),
      jobId: Number(f.get("jobId")),
      phone: f.get("phone"),
      email: f.get("email"),
      linkedinUrl: f.get("linkedin"),
      professionalTitle: f.get("professionalTitle"),
      company: f.get("company"),
      yearsExperience: Number(f.get("years") || 0),
      technologies: String(f.get("tech") || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      experienceSummary: f.get("summary"),
    });
    setBusy(false);
  }
  return (
    <Modal title="מועמד חדש" close={close}>
      <form className="form-grid" onSubmit={submit}>
        <label>
          שם מלא
          <input name="name" required />
        </label>
        <label>
          משרה
          <select
            name="jobId"
            defaultValue={initialJobId || jobs[0]?.id}
            required
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} · {j.client}
              </option>
            ))}
          </select>
        </label>
        <label>
          טלפון
          <input name="phone" />
        </label>
        <label>
          דוא״ל
          <input name="email" type="email" />
        </label>
        <label>
          LinkedIn
          <input name="linkedin" />
        </label>
        <label>
          תפקיד מקצועי נוכחי / אחרון
          <input name="professionalTitle" placeholder="למשל Data Engineer" />
        </label>
        <label>
          חברה נוכחית / אחרונה
          <input name="company" />
        </label>
        <label>
          שנות ניסיון
          <input name="years" type="number" min="0" />
        </label>
        <label>
          טכנולוגיות, מופרדות בפסיקים
          <input name="tech" />
        </label>
        <label className="wide">
          תקציר ניסיון
          <textarea name="summary" />
        </label>
        <div className="form-actions wide">
          <button type="button" className="secondary" onClick={close}>
            ביטול
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "שומר..." : "הוספת מועמד"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CandidateEditForm({
  candidate,
  close,
  save,
}: {
  candidate: Candidate;
  close: () => void;
  save: (b: Record<string, unknown>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      await save({
        fullName: f.get("name"),
        phone: f.get("phone"),
        email: f.get("email"),
        linkedinUrl: f.get("linkedin"),
        professionalTitle: f.get("professionalTitle"),
        company: f.get("company"),
        yearsExperience: Number(f.get("years") || 0),
        technologies: String(f.get("tech") || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        experienceSummary: f.get("summary"),
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="עריכת פרטי מועמד" close={close}>
      <form className="form-grid" onSubmit={submit}>
        <label>שם מלא<input name="name" required defaultValue={candidate.name} /></label>
        <label>טלפון<input name="phone" defaultValue={candidate.phone} /></label>
        <label>דוא״ל<input name="email" type="email" defaultValue={candidate.email} /></label>
        <label>LinkedIn<input name="linkedin" defaultValue={candidate.linkedin} /></label>
        <label>תפקיד מקצועי נוכחי / אחרון<input name="professionalTitle" defaultValue={candidate.professionalTitle} /></label>
        <label>חברה נוכחית / אחרונה<input name="company" defaultValue={candidate.company} /></label>
        <label>שנות ניסיון<input name="years" type="number" min="0" defaultValue={candidate.years || ""} /></label>
        <label className="wide">טכנולוגיות, מופרדות בפסיקים<input name="tech" defaultValue={candidate.tech.join(", ")} /></label>
        <label className="wide">תקציר ניסיון<textarea name="summary" defaultValue={candidate.summary} /></label>
        <div className="form-help wide">אפשר לתקן כאן גם טקסט שחולץ או נוצר אוטומטית. השינוי נשמר בפרטי המועמד ומשותף לכל מועמדויותיו.</div>
        <div className="form-actions wide"><button type="button" className="secondary" onClick={close}>ביטול</button><button className="primary" disabled={busy}>{busy ? "שומר..." : "שמירת שינויים"}</button></div>
      </form>
    </Modal>
  );
}

function UserManagementPage({
  rows,
  ownerEmail,
  save,
  remove,
}: {
  rows: AppUser[];
  ownerEmail: string;
  save: (email: string, role: "admin" | "user") => Promise<unknown>;
  remove: (email: string) => Promise<unknown>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(email);
    setMessage("");
    try {
      await save(email, role);
      setEmail("");
      setRole("user");
      setMessage("המשתמש נשמר בהצלחה.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "השמירה נכשלה");
    } finally {
      setBusy("");
    }
  }
  async function changeRole(row: AppUser, nextRole: "admin" | "user") {
    setBusy(row.email);
    setMessage("");
    try { await save(row.email, nextRole); }
    catch (error) { setMessage(error instanceof Error ? error.message : "השמירה נכשלה"); }
    finally { setBusy(""); }
  }
  return (
    <>
      <Heading title="משתמשים והרשאות" subtitle="רשימת המיילים המורשים להיכנס למערכת והגדרת תפקידם." />
      <div className="instructions-warning users-access-note">
        <b>כיצד ההרשאה עובדת:</b> אתר ה-Sites משותף באמצעות קישור, אך הנתונים נפתחים רק לאחר התחברות ל-ChatGPT ורק אם כתובת המייל נמצאת ברשימה זו. משתמש רגיל אינו רואה את ניהול המשתמשים או את הוראות ה-AI.
      </div>
      <section className="panel user-management">
        <div className="panel-head padded"><div><h2>הוספת משתמש מורשה</h2><p>רק מנהל יכול לצפות במסך זה ולשנות את הרשימה.</p></div></div>
        <form className="user-add-form" onSubmit={submit}>
          <label>כתובת מייל<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" dir="ltr" /></label>
          <label>תפקיד<select value={role} onChange={(e) => setRole(e.target.value as "admin" | "user")}><option value="user">משתמש רגיל</option><option value="admin">מנהל</option></select></label>
          <button className="primary" disabled={Boolean(busy)}>{busy ? "שומר..." : "הוספה / עדכון"}</button>
        </form>
        {message && <div className={`cv-message ${message.includes("נכשלה") ? "error" : "success"}`}>{message}</div>}
        <div className="user-list">
          {rows.map((row) => {
            const isOwner = row.email === ownerEmail;
            return <article key={row.email}>
              <div><b dir="ltr">{row.email}</b><span>{isOwner ? "מנהל מערכת ראשי" : row.role === "admin" ? "מנהל" : "משתמש רגיל"}</span></div>
              <select aria-label={`תפקיד עבור ${row.email}`} value={row.role} disabled={isOwner || busy === row.email} onChange={(e) => changeRole(row, e.target.value as "admin" | "user")}><option value="user">משתמש רגיל</option><option value="admin">מנהל</option></select>
              <button className="danger-text-button" disabled={isOwner || busy === row.email} onClick={async () => { if (confirm(`להסיר את ${row.email} מרשימת התפקידים?`)) { setBusy(row.email); try { await remove(row.email); } finally { setBusy(""); } } }}>הסרה</button>
            </article>;
          })}
        </div>
      </section>
    </>
  );
}

function AiInstructionsPage({
  rows,
  save,
  refresh,
}: {
  rows: AiInstruction[];
  save: (key: string, content: string, reset?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const [activeKey, setActiveKey] = useState(rows[0]?.key || "candidate_evaluation");
  const active = rows.find((row) => row.key === activeKey) || rows[0];
  const [draft, setDraft] = useState(active?.content || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const selected = rows.find((row) => row.key === activeKey) || rows[0];
    setDraft(selected?.content || "");
    setMessage("");
  }, [activeKey, rows]);
  if (!active) return <div className="loading">טוען הוראות...</div>;
  async function submit(reset = false) {
    if (reset && !confirm("להחזיר את ההוראות לגרסת ברירת המחדל? השינויים הידניים יימחקו.")) return;
    setSaving(true);
    setMessage("");
    try {
      await save(active.key, draft, reset);
      await refresh();
      setMessage(reset ? "הוראות ברירת המחדל שוחזרו." : "ההוראות נשמרו וישמשו מהפעלת ה-AI הבאה.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "שמירת ההוראות נכשלה");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Heading title="הוראות AI" subtitle="צפייה ועריכה של ההוראות המקצועיות שמפעילות את מנועי ה-AI במערכת." />
      <div className="instructions-warning">
        <b>חשוב:</b> שינויים נשמרים מיד ומשפיעים על פעולות AI חדשות בלבד. הערכות ותוצאות שכבר נשמרו אינן משתנות עד להפעלה מחדש.
      </div>
      <section className="instructions-layout">
        <nav className="panel instruction-list" aria-label="סוגי הוראות AI">
          {rows.map((row) => (
            <button key={row.key} className={row.key === active.key ? "active" : ""} onClick={() => setActiveKey(row.key)}>
              <b>{row.title}</b>
              <span>{row.description}</span>
              <small>{row.isCustom ? "נערך ידנית" : "ברירת מחדל"}</small>
            </button>
          ))}
        </nav>
        <section className="panel instruction-editor">
          <div className="instruction-editor-head">
            <div><h2>{active.title}</h2><p>{active.description}</p></div>
            <span className={`pill ${active.isCustom ? "warning" : "neutral"}`}>{active.isCustom ? "גרסה מותאמת" : "ברירת מחדל"}</span>
          </div>
          <textarea value={draft} onChange={(event) => { setDraft(event.target.value); setMessage(""); }} spellCheck={false} />
          <div className="instruction-meta">
            <span>{draft.length.toLocaleString("he-IL")} תווים</span>
            <span>כאן עורכים את ההוראות המקצועיות. שדות התוצאה הקבועים, כמו ציון, המלצה ופערים, נשמרים אוטומטית כדי שהתצוגה תמשיך לפעול.</span>
          </div>
          <div className="instruction-actions">
            <button className="secondary" disabled={saving || !active.isCustom} onClick={() => submit(true)}>איפוס לגרסה המקורית</button>
            <button className="primary" disabled={saving || draft.trim().length < 50 || draft === active.content} onClick={() => submit(false)}>{saving ? "שומר..." : "שמירת השינויים"}</button>
          </div>
          {message && <div className={`cv-message ${message.includes("נכשלה") ? "error" : "success"}`}>{message}</div>}
        </section>
      </section>
    </>
  );
}

function AiActivityPage({ rows }: { rows: AiActivity[] }) {
  const total = rows.reduce((sum, row) => sum + row.estimatedCostUsd, 0);
  const tokens = rows.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0);
  return (
    <>
      <Heading title="פעילות AI ועלויות" subtitle="יומן הפעולות שבוצעו מתוך המערכת והעלות המשוערת שלהן." />
      <section className="stats-grid ai-stats">
        <Stat icon="✦" tone="purple" value={rows.length} label="פעולות AI" note="100 הפעולות האחרונות" />
        <article className="stat-card"><div className="stat-icon green">$</div><div><strong>${total.toFixed(4)}</strong><span>עלות משוערת</span><small>לפי תעריפי המודל</small></div></article>
        <article className="stat-card"><div className="stat-icon blue">#</div><div><strong>{tokens.toLocaleString("he-IL")}</strong><span>טוקנים</span><small>קלט ופלט יחד</small></div></article>
      </section>
      <section className="panel table-panel">
        <div className="panel-head padded"><div><h2>יומן פעולות</h2><p>החיוב הרשמי מופיע בחשבון OpenAI. הסכומים כאן הם אומדן.</p></div></div>
        <div className="table-wrap">
          <table><thead><tr><th>תאריך</th><th>פעולה</th><th>פריט</th><th>מודל</th><th>טוקנים בקלט</th><th>טוקנים בפלט</th><th>עלות משוערת</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id} className="static-row"><td>{formatDate(row.createdAt)}</td><td><b>{row.actionType}</b></td><td>{row.subjectLabel}</td><td>{row.model}</td><td>{row.inputTokens.toLocaleString("he-IL")}{row.cachedInputTokens > 0 && <small className="cell-sub">מתוכם {row.cachedInputTokens.toLocaleString("he-IL")} מהמטמון</small>}</td><td>{row.outputTokens.toLocaleString("he-IL")}</td><td>${row.estimatedCostUsd.toFixed(5)}</td></tr>)}</tbody>
          </table>
        </div>
        {!rows.length && <div className="empty-panel"><span>✦</span><h2>עדיין לא נרשמו פעולות AI</h2><p>פעולות חדשות של יצירת משרה והערכת מועמד יופיעו כאן. פעולות שבוצעו לפני הוספת היומן אינן ניתנות לשחזור.</p></div>}
      </section>
      <div className="privacy-note ai-cost-note">העלות מחושבת לפי מספר הטוקנים ותעריף המודל בזמן הפיתוח. היא עשויה להיות שונה מעט מהחיוב בפועל, למשל עקב מטמון, מסלול עיבוד או שינוי תעריפים.</div>
    </>
  );
}

function ArchivePage({
  jobs,
  applications,
  restoreJob,
  restoreApplication,
  refresh,
}: {
  jobs: ArchivedJob[];
  applications: ArchivedApplication[];
  restoreJob: (id: number) => Promise<void>;
  restoreApplication: (id: number) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const [restoring, setRestoring] = useState("");
  async function restore(kind: "job" | "application", id: number) {
    setRestoring(`${kind}-${id}`);
    try {
      if (kind === "job") await restoreJob(id);
      else await restoreApplication(id);
      await refresh();
    } finally {
      setRestoring("");
    }
  }
  return (
    <>
      <Heading title="ארכיון" subtitle="משרות ומועמדויות שהוסרו מהעבודה השוטפת. ניתן לשחזר אותן בכל עת." />
      <div className="archive-grid">
        <section className="panel archive-panel">
          <div className="panel-head padded"><div><h2>משרות בארכיון</h2><p>{jobs.length} משרות</p></div></div>
          {jobs.map((job) => (
            <article className="archive-row" key={job.id}>
              <div><b>{job.title}</b><span>{job.client} · {job.status}</span></div>
              <button className="secondary" disabled={restoring === `job-${job.id}`} onClick={() => restore("job", job.id)}>{restoring === `job-${job.id}` ? "משחזר..." : "שחזור משרה"}</button>
            </article>
          ))}
          {!jobs.length && <div className="archive-empty">אין משרות בארכיון</div>}
        </section>
        <section className="panel archive-panel">
          <div className="panel-head padded"><div><h2>מועמדויות בארכיון</h2><p>{applications.length} מועמדויות</p></div></div>
          {applications.map((application) => (
            <article className="archive-row" key={application.applicationId}>
              <div><b>{application.candidateName}</b><span>{application.role} · {application.client} · {application.status}</span></div>
              <button className="secondary" disabled={restoring === `application-${application.applicationId}`} onClick={() => restore("application", application.applicationId)}>{restoring === `application-${application.applicationId}` ? "משחזר..." : "שחזור מועמדות"}</button>
            </article>
          ))}
          {!applications.length && <div className="archive-empty">אין מועמדויות בארכיון</div>}
        </section>
      </div>
      <div className="privacy-note">העברה לארכיון אינה מוחקת מידע. מחיקה לצמיתות מתבצעת רק באמצעות פעולת מחיקה מפורשת.</div>
    </>
  );
}

function UsageGuide({ setView }: { setView: (v: View) => void }) {
  const steps = [
    ["1", "יוצרים משרה", "מדביקים מלל חופשי ממייל או מדרישות הלקוח. ה-AI מציע טיוטה מובנית, ואתה בודק, מתקן ושומר."],
    ["2", "מוסיפים מועמד", "יוצרים מועמד ומשייכים אותו למשרה. אותו אדם יכול להיות משויך למספר משרות, ולכל מועמדות נשמרים בנפרד סטטוס, ראיון והערכת AI."],
    ["3", "בונים את תיק המועמד", "מעלים PDF, בוחרים חילוץ מהיר או חילוץ חכם, בודקים ומתקנים את הפרטים. באותו מסך אפשר לשמור גם את חוות דעת המגייס מהראיון הראשוני."],
    ["4", "מפיקים הערכה ראשונית", "ה-AI משווה בין דרישות המשרה, קורות החיים וחוות דעת המגייס אם הוזנה, ומחזיר ציון, חוזקות, פערים ושאלות לבירור."],
    ["5", "מתעדים ראיון מקצועי", "אפשר לכתוב סיכום ידנית או להדביק תמלול והערות. ה-AI יוצר טיוטה, אתה עורך ומאשר, ורק אז היא עוברת לסיכום הראיון."],
    ["6", "מפיקים הערכה סופית", "לוחצים על הערכה מחדש. הפעם הניתוח כולל גם את סיכום הראיון ונשמר רק במועמדות הנוכחית."],
    ["7", "מגדירים המשך טיפול", "הסטטוס מתקדם אוטומטית בהעלאת קורות חיים, בקביעת ראיון ובשמירת סיכום. החלטות כמו עבר, נדחה והועבר ללקוח נשארות ידניות. תמיד ניתן לשנות ידנית, עם אזהרה במקרה של סתירה."],
    ["8", "עוקבים אחרי שימוש ב-AI", "במסך פעילות AI ועלויות רואים פעולות חדשות, טוקנים ועלות משוערת. החיוב הרשמי נשאר בחשבון OpenAI."],
  ];
  return (
    <>
      <Heading
        title="מדריך שימוש ותיעוד המערכת"
        subtitle="הסבר מעשי על מבנה המערכת, זרימת העבודה, מקורות המידע ופעולות ה-AI."
        action={
          <button className="primary" onClick={() => setView("jobs")}>
            מתחילים ביצירת משרה
          </button>
        }
      />
      <section className="guide-intro panel">
        <div className="guide-intro-icon">◎</div>
        <div>
          <h2>מה נשמר והיכן</h2>
          <p>פרטי המועמד, קורות החיים וחוות דעת המגייס נשמרים בתיק המועמד. סטטוס, סיכום ראיון מקצועי והערכת AI נשמרים בנפרד לכל מועמדות.</p>
        </div>
      </section>
      <section className="guide-flow">
        {steps.map((s) => (
          <article className="guide-flow-step panel" key={s[0]}>
            <div className="step-number">{s[0]}</div>
            <div className="step-copy">
              <h2>{s[1]}</h2>
              <p>{s[2]}</p>
            </div>
          </article>
        ))}
      </section>
      <div className="guide-bottom-grid">
        <section className="panel guide-rule">
          <span className="rule-icon purple">✦</span>
          <div>
            <h2>שתי נקודות הערכה</h2>
            <p>
              הערכה ראשונית מבוססת על משרה וקורות חיים. הערכה לאחר ראיון כוללת
              גם את סיכום הראיון המקצועי. חוות דעת מגייס, אם נשמרה בתיק המועמד,
              משמשת מקור משלים בשתי ההערכות. לאחר שינוי במקורות יש להפעיל הערכה מחדש.
            </p>
          </div>
        </section>
        <section className="panel guide-rule">
          <span className="rule-icon orange">!</span>
          <div>
            <h2>אין השלמת מידע חסר</h2>
            <p>מידע שלא נמצא יסומן כלא ידוע או דורש בירור.</p>
          </div>
        </section>
      </div>
    </>
  );
}
