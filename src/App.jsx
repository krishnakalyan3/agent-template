import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Check,
  Copy,
  DownloadSimple,
  Shuffle,
  Cube,
  SquaresFour,
  GearSix,
  Sparkle,
  Lock,
  MagnifyingGlass,
  SignOut,
  Plus,
  X,
  CheckCircle,
} from "@phosphor-icons/react";
import {
  souls,
  personalities,
  skillOptions,
  reference,
  markdown,
} from "./templates";

const randomName = () =>
  `${["Curious", "Bright", "Thoughtful", "Clever", "Steady", "Inventive"][Math.floor(Math.random() * 6)]} ${["Cedar", "Otter", "Comet", "Finch", "Orbit", "Fox"][Math.floor(Math.random() * 6)]} ${Math.floor(100 + Math.random() * 900)}`;
const initial = () => ({
  name: randomName(),
  soul: souls["Thoughtful collaborator"],
  personality: personalities["Warm & clear"],
  skills: ["Research", "Planning"],
  instructions: "",
  email: "",
  sendEmail: false,
});
async function api(url, options) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
function download(t, section = "all") {
  const url = URL.createObjectURL(
    new Blob([markdown(t, section)], { type: "text/markdown" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${section === "all" ? "agent" : section}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
export function App() {
  const [path, setPath] = useState(location.pathname);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const listener = () => setPath(location.pathname);
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  function navigate(next) {
    history.pushState({}, "", next);
    setPath(next);
    window.scrollTo(0, 0);
  }
  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied to clipboard");
    } catch {
      setNotice("Clipboard unavailable. Use Download instead.");
    }
  }
  const admin = path.startsWith("/admin");
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          <span className="brand-icon">
            <Cube size={25} weight="bold" />
          </span>
          <span>
            Agent
            <br />
            <strong>Workshop</strong>
          </span>
        </a>
        <div className="workshop-label">BUILD · EXPERIMENT · LEARN</div>
        <nav>
          <a
            className={!admin ? "active" : ""}
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
          >
            <SquaresFour size={20} /> Build an agent{" "}
            <ArrowUpRight className="nav-arrow" size={16} />
          </a>
          <a
            className={admin ? "active" : ""}
            href="/admin"
            onClick={(e) => {
              e.preventDefault();
              navigate("/admin");
            }}
          >
            <GearSix size={20} /> Admin workspace
          </a>
        </nav>
        <div className="sidebar-note">
          <span className="tiny-label">THE BUILD PART STARTS HERE</span>
          <p>
            Same demo.
            <br />
            Your ingredients.
            <br />A different agent.
          </p>
          <div className="ingredient-art">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <footer>
          <span className="nvidia-mark">NVIDIA</span>
          <span>Agent demo lab</span>
        </footer>
      </aside>
      <main>
        <header className="topbar">
          <span>
            AGENT DEMO LAB{" "}
            <span className="breadcrumb">
              / {admin ? "Admin workspace" : "Create a template"}
            </span>
          </span>
          <span className="workshop-badge">
            <span /> HANDS-ON WORKSHOP
          </span>
        </header>
        {admin ? (
          <Admin copy={copy} navigate={navigate} />
        ) : (
          <Builder
            key={path}
            token={path.startsWith("/edit/") ? path.split("/")[2] : null}
            copy={copy}
            navigate={navigate}
          />
        )}
        <div className="page-footer">
          <span>Built by you. Ready to experiment.</span>
          <span>
            AGENT WORKSHOP <span className="green-square" />
          </span>
        </div>
      </main>
      {notice ? (
        <div className="toast" role="status">
          <CheckCircle size={20} />
          {notice}
        </div>
      ) : null}
    </div>
  );
}
function Builder({ token, copy, navigate }) {
  const [form, setForm] = useState(initial);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [loading, setLoading] = useState(Boolean(token));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);
  const [customSkill, setCustomSkill] = useState("");
  useEffect(() => {
    let alive = true;
    api("/api/config")
      .then((c) => {
        if (alive) setEmailEnabled(c.emailEnabled);
      })
      .catch(() => {});
    if (token)
      api(`/api/templates/${token}`)
        .then((t) => {
          if (alive) setForm({ ...t, sendEmail: false });
        })
        .catch((e) => {
          if (alive) setError(e.message);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    return () => {
      alive = false;
    };
  }, [token]);
  const change = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  function toggleSkill(skill) {
    change(
      "skills",
      form.skills.includes(skill)
        ? form.skills.filter((s) => s !== skill)
        : [...form.skills, skill],
    );
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api(
        token ? `/api/templates/${token}` : "/api/templates",
        { method: token ? "PUT" : "POST", body: JSON.stringify(form) },
      );
      setSaved(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="page">
        <div className="skeleton" />
        <div className="skeleton large" />
        <p role="status">Loading your template…</p>
      </div>
    );
  if (saved) {
    const link = `${location.origin}/edit/${saved.editToken}`;
    return (
      <div className="page success-page">
        <span className="eyebrow">YOUR NEXT EXPERIMENT</span>
        <div className="success-icon">
          <Check size={36} />
        </div>
        <h1>
          {token
            ? "A fresh version. Same agent."
            : "Your agent is ready for the demo."}
        </h1>
        <p className="lead">
          <strong>{form.name}</strong> is saved. Ask your facilitator to run the
          demo with your ingredients, then compare the results.
        </p>
        <section className="success-panel">
          <h2>Keep your private edit link</h2>
          <p>
            Use this link to come back and change your agent. Anyone with the
            link can edit it.
          </p>
          <input aria-label="Private edit link" readOnly value={link} />
          <div className="button-row">
            <button className="primary" onClick={() => copy(link)}>
              <Copy /> Copy edit link
            </button>
            <button className="secondary" onClick={() => download(form)}>
              <DownloadSimple /> Download template
            </button>
          </div>
          {saved.emailStatus === "sent" ? (
            <p className="success-text">
              Your template and edit link were emailed to you.
            </p>
          ) : saved.emailStatus === "failed" ? (
            <p role="alert" className="error">
              Your template is saved, but email delivery failed. Copy your edit
              link above.
            </p>
          ) : null}
        </section>
        <div className="button-row">
          <button
            className="text-button"
            onClick={() => navigate(`/edit/${saved.editToken}`)}
          >
            <ArrowLeft /> Edit this agent
          </button>
          <button
            className="text-button"
            onClick={() => {
              if (location.pathname === "/") {
                setForm(initial());
                setSaved(null);
              } else navigate("/");
            }}
          >
            <Plus /> Build another agent
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="page">
      <div className="intro">
        <div>
          <span className="eyebrow">
            A FEW INGREDIENTS. AN AGENT THAT’S YOURS.
          </span>
          <h1>Build your agent.</h1>
          <p className="lead">
            Give it a purpose, a personality, and a few skills.
            <br className="desktop-break" /> Then see what happens when{" "}
            <em>your</em> agent runs the demo.
          </p>
        </div>
        <div className="time-note">
          <span>~ 3–5 MIN</span>
          <p>
            No code needed.
            <br />
            Just your ideas.
          </p>
        </div>
      </div>
      <div className="builder-grid">
        <form onSubmit={submit}>
          <section className="name-section">
            <div className="section-heading">
              <span className="step">01</span>
              <div>
                <h2>Meet your agent</h2>
                <p>Every agent needs a name. Make this one yours.</p>
              </div>
            </div>
            <label htmlFor="name">Agent name</label>
            <div className="name-input">
              <input
                id="name"
                required
                maxLength={100}
                value={form.name}
                onChange={(e) => change("name", e.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                title="Generate a new name"
                aria-label="Generate a new name"
                onClick={() => change("name", randomName())}
              >
                <Shuffle size={21} />
              </button>
            </div>
          </section>
          <Ingredient
            number="02"
            title="Give it a soul"
            description="The soul is your agent’s purpose and principles: what it cares about, how it makes decisions, and where it draws the line."
            presets={souls}
            value={form.soul}
            onChange={(v) => change("soul", v)}
            label="Soul"
          />
          <Ingredient
            number="03"
            title="Shape its personality"
            description="Personality is how your agent shows up: its tone, communication style, and the feeling of working with it."
            presets={personalities}
            value={form.personality}
            onChange={(v) => change("personality", v)}
            label="Personality"
          />
          <section className="ingredient">
            <div className="section-heading">
              <span className="step">04</span>
              <div>
                <h2>Choose its skills</h2>
                <p>
                  What should your agent be good at? Choose a few, or add your
                  own.
                </p>
              </div>
            </div>
            <div className="skills-grid">
              {skillOptions.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`skill-option ${form.skills.includes(s.id) ? "selected" : ""}`}
                  onClick={() => toggleSkill(s.id)}
                  aria-pressed={form.skills.includes(s.id)}
                >
                  <span className="skill-name">
                    <span className="checkbox">
                      {form.skills.includes(s.id) ? (
                        <Check size={12} weight="bold" />
                      ) : null}
                    </span>
                    {s.id}
                  </span>
                  <span>{s.detail}</span>
                </button>
              ))}
            </div>
            {form.skills
              .filter((s) => !skillOptions.some((o) => o.id === s))
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  className="custom-tag"
                  onClick={() => toggleSkill(s)}
                >
                  {s}
                  <X size={12} />
                </button>
              ))}
            <label htmlFor="custom-skill">Add a custom skill</label>
            <div className="inline-input">
              <input
                id="custom-skill"
                maxLength={100}
                value={customSkill}
                onChange={(e) => setCustomSkill(e.target.value)}
                placeholder="e.g. Explain scientific papers"
              />
              <button
                type="button"
                className="secondary"
                disabled={!customSkill.trim() || form.skills.length >= 30}
                onClick={() => {
                  const s = customSkill.trim();
                  if (s && !form.skills.includes(s))
                    change("skills", [...form.skills, s]);
                  setCustomSkill("");
                }}
              >
                <Plus size={16} /> Add
              </button>
            </div>
            <p className="helper">
              These describe capabilities. Your facilitator connects the tools
              in the demo.
            </p>
            <label htmlFor="instructions">
              Anything else it should know?{" "}
              <span className="optional">Optional</span>
            </label>
            <textarea
              id="instructions"
              maxLength={12000}
              rows={3}
              placeholder="e.g. Ask one question at a time. Always explain your reasoning."
              value={form.instructions}
              onChange={(e) => change("instructions", e.target.value)}
            />
          </section>
          <section className="delivery-section">
            <h2>A little room to iterate.</h2>
            <p>
              You’ll get a private edit link after saving. Keep it to refine
              your agent later.
            </p>
            <label htmlFor="email">
              Your email <span className="optional">Optional</span>
            </label>
            <input
              id="email"
              type="email"
              maxLength={254}
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => change("email", e.target.value)}
            />
            <label className="check-label">
              <input
                type="checkbox"
                disabled={!emailEnabled}
                checked={form.sendEmail}
                onChange={(e) => change("sendEmail", e.target.checked)}
              />{" "}
              Email me my template and edit link
            </label>
            {!emailEnabled ? (
              <p className="helper">
                Email delivery isn’t enabled for this workshop yet. You can
                still copy your edit link.
              </p>
            ) : (
              <p className="helper">
                Your email is visible to the workshop admin. We only send a copy
                when you select this option.
              </p>
            )}
          </section>
          {error ? (
            <div className="error" role="alert">
              {error}
            </div>
          ) : null}
          <div className="submit-row">
            <span>
              Your ideas are the starting point.
              <br />
              You can always change them.
            </span>
            <button
              className="primary"
              disabled={busy || (Boolean(token) && !form.id)}
            >
              {busy
                ? "Saving your agent…"
                : token
                  ? "Save changes"
                  : "Save my agent"}
              <ArrowRight size={18} />
            </button>
          </div>
        </form>
        <aside className="preview-column">
          <div className="preview">
            <div className="preview-top">
              <span className="tiny-label">YOUR AGENT, TAKING SHAPE</span>
              <span className="preview-dot" />
            </div>
            <div className="agent-glyph">
              <Cube size={42} weight="duotone" />
            </div>
            <h2>{form.name || "Your agent"}</h2>
            <span className="preview-caption">
              A WORK IN PROGRESS. A WORLD OF POSSIBILITIES.
            </span>
            <div className="preview-rule" />
            <PreviewPart title="SOUL" text={form.soul} />
            <PreviewPart title="PERSONALITY" text={form.personality} />
            <span className="tiny-label muted">
              SKILLS · {form.skills.length}
            </span>
            <div className="preview-tags">
              {form.skills.length ? (
                form.skills.map((s) => <span key={s}>{s}</span>)
              ) : (
                <p>Choose what your agent can do.</p>
              )}
            </div>
            {form.instructions ? (
              <PreviewPart
                title="EXTRA INSTRUCTIONS"
                text={form.instructions}
              />
            ) : null}
            <div className="preview-bottom">
              <span className="live-dot" /> Live preview{" "}
              <button
                type="button"
                aria-label="Copy agent preview"
                title="Copy agent preview"
                onClick={() => copy(markdown(form))}
              >
                <Copy size={17} />
              </button>
            </div>
          </div>
          <div className="experiment-note">
            <Sparkle size={23} />
            <div>
              <h3>The interesting part comes next.</h3>
              <p>
                Run the same demo with different ingredients. What changes? What
                stays the same? That’s how you learn to build.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
function Ingredient({
  number,
  title,
  description,
  presets,
  value,
  onChange,
  label,
}) {
  return (
    <section className="ingredient">
      <div className="section-heading">
        <span className="step">{number}</span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <span className="field-label">Start with an example</span>
      <div className="preset-row">
        {Object.entries(presets).map(([name, text]) => (
          <button
            type="button"
            key={name}
            className={text === value ? "preset active" : "preset"}
            onClick={() => onChange(text)}
          >
            {name}
            {text === value ? <Check size={14} /> : null}
          </button>
        ))}
      </div>
      <label htmlFor={label.toLowerCase()}>
        {label}{" "}
        <span className="editable-label" aria-hidden="true">
          MAKE IT YOUR OWN
        </span>
      </label>
      <textarea
        id={label.toLowerCase()}
        rows={5}
        required
        maxLength={12000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="helper">
        Edit the example above. Every word is yours to change.
      </p>
    </section>
  );
}
function PreviewPart({ title, text }) {
  return (
    <div className="preview-part">
      <span className="tiny-label muted">{title}</span>
      <p>{text || "Your ideas will appear here."}</p>
    </div>
  );
}
function Admin({ copy, navigate }) {
  const [records, setRecords] = useState(null),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(null),
    [compare, setCompare] = useState(false),
    [section, setSection] = useState("all");
  async function load() {
    try {
      const data = await api("/api/admin/templates");
      setRecords(data);
      setSelected((s) => data.find((t) => t.id === s?.id) || null);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function login(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!records)
    return (
      <div className="page login-page">
        <span className="eyebrow">FOR THE FACILITATORS</span>
        <h1>Admin workspace.</h1>
        <p className="lead">
          All the workshop’s agent ingredients, in one place.
        </p>
        <form className="login-panel" onSubmit={login}>
          <Lock size={28} />
          <h2>Sign in to your workshop</h2>
          <p>Use the admin password configured for this app.</p>
          <label htmlFor="password">Admin password</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Open workspace"}
            <ArrowRight />
          </button>
        </form>
      </div>
    );
  const filtered = records.filter((t) =>
    `${t.name} ${t.email} ${t.skills.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="page">
      <div className="intro">
        <div>
          <span className="eyebrow">THE WORKSHOP’S INGREDIENTS</span>
          <h1>Agent collection.</h1>
          <p className="lead">Run, compare, and look under the hood.</p>
        </div>
        <button
          className="secondary"
          onClick={async () => {
            await api("/api/admin/logout", { method: "POST" });
            setRecords(null);
            setSelected(null);
            setError("");
          }}
        >
          <SignOut size={18} /> Sign out
        </button>
      </div>
      <div className="admin-toolbar">
        <div className="search">
          <MagnifyingGlass size={19} />
          <input
            aria-label="Search agents"
            placeholder="Search names, emails, or skills…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span>
          {records.length} agent{records.length === 1 ? "" : "s"} saved
        </span>
        <button className="secondary" onClick={load}>
          Refresh
        </button>
        <button className="primary" onClick={() => copy(location.origin)}>
          <Copy size={17} /> Copy attendee link
        </button>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {records.length === 0 ? (
        <div className="empty-state">
          <Cube size={42} />
          <h2>Your first agent starts with a link.</h2>
          <p>Share the attendee form. Submitted agents will appear here.</p>
          <button className="secondary" onClick={() => navigate("/")}>
            Open attendee form
            <ArrowUpRight />
          </button>
        </div>
      ) : (
        <div className="collection">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>AGENT NAME</th>
                  <th>SKILLS</th>
                  <th>LAST UPDATED</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.name}</strong>
                      <span className="table-email">
                        {t.email || "No email provided"}
                      </span>
                    </td>
                    <td>
                      <div className="table-tags">
                        {t.skills.slice(0, 3).map((s) => (
                          <span key={s}>{s}</span>
                        ))}
                        {t.skills.length > 3 ? (
                          <span>+{t.skills.length - 3}</span>
                        ) : null}
                      </div>
                    </td>
                    <td>{new Date(t.updated_at).toLocaleString()}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSelected(t);
                          setCompare(false);
                        }}
                      >
                        View template
                        <ArrowUpRight size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 ? (
              <p className="no-results">No agents match this search.</p>
            ) : null}
          </div>
        </div>
      )}
      {selected ? (
        <section className="detail-panel">
          <div className="detail-heading">
            <div>
              <span className="eyebrow">LOOK UNDER THE HOOD</span>
              <h2>{selected.name}</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Close template"
              onClick={() => setSelected(null)}
            >
              <X size={22} />
            </button>
          </div>
          <div className="detail-actions">
            <select
              aria-label="Export section"
              value={section}
              onChange={(e) => setSection(e.target.value)}
            >
              <option value="all">Full agent template</option>
              <option value="soul">Soul · SOUL.md</option>
              <option value="personality">Personality</option>
              <option value="skills">Skills & instructions</option>
            </select>
            <button
              className="secondary"
              onClick={() => copy(markdown(selected, section))}
            >
              <Copy /> Copy Markdown
            </button>
            <button
              className="secondary"
              onClick={() => download(selected, section)}
            >
              <DownloadSimple /> Download
            </button>
            <button
              className={compare ? "primary" : "secondary"}
              onClick={() => setCompare(!compare)}
            >
              Compare with example
            </button>
          </div>
          <p className="helper">
            Copy these ingredients into your OpenClaw or Hermes setup. Tool
            installation and agent execution happen in the demo.
          </p>
          <div className={compare ? "comparison" : ""}>
            <div>
              <h3>Attendee agent</h3>
              <pre>{markdown(selected, section)}</pre>
            </div>
            {compare ? (
              <div>
                <h3>
                  {reference.name}{" "}
                  <span className="optional">Workshop example</span>
                </h3>
                <pre>{markdown(reference, section)}</pre>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
