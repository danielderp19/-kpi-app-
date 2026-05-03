import { useState, useRef, useEffect } from "react";
import { CheckCircle2, Circle, ChevronRight, Send, Sparkles, RotateCcw, Menu, X } from "lucide-react";

const P = {
  bg: "#0f0a1e",
  card: "rgba(255,255,255,0.04)",
  border: "rgba(168,85,247,0.18)",
  borderHi: "rgba(168,85,247,0.55)",
  p1: "#a855f7",
  p3: "#ec4899",
  txt: "#f0e6ff",
  muted: "rgba(240,230,255,0.5)",
};

const LVL = [
  { from: "#a855f7", to: "#7c3aed" },
  { from: "#7c3aed", to: "#6d28d9" },
  { from: "#9333ea", to: "#db2777" },
  { from: "#db2777", to: "#f59e0b" },
  { from: "#f59e0b", to: "#ef4444" },
];

const lvlGrad = (l) => {
  const c = LVL[Math.min(l, LVL.length - 1)];
  return `linear-gradient(135deg, ${c.from}, ${c.to})`;
};

let _id = 1;
const uid = () => `n${_id++}`;

function totalNodes(node) {
  let n = 1;
  if (node.children && node.children.length > 0) {
    node.children.forEach((c) => {
      n += totalNodes(c);
    });
  }
  return n;
}

function doneNodes(node, done) {
  let n = done[node.id] ? 1 : 0;
  if (node.children && node.children.length > 0) {
    node.children.forEach((c) => {
      n += doneNodes(c, done);
    });
  }
  return n;
}

function parseResponse(raw) {
  try {
    const text = raw.map((b) => (b.type === "text" ? b.text : "")).join("");
    const match = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    if (!match) return null;
    const parsed = JSON.parse(match[1]);
    return parsed.trees ?? null;
  } catch {
    return null;
  }
}

function stampIds(node, level = 0) {
  return {
    ...node,
    id: uid(),
    level,
    progress: node.progress ?? 0,
    children: (node.children || []).map((c) => stampIds(c, level + 1)),
  };
}

export default function App() {
  const [trees, setTrees] = useState([]);
  const [done, setDone] = useState({});
  const [expanded, setExpanded] = useState({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatLog, setChatLog] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState("dashboard");
  const [pulse, setPulse] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const inputRef = useRef();
  const chatEnd = useRef();

  useEffect(() => {
    try {
      const savedTrees = localStorage.getItem("kpiTrees");
      const savedDone = localStorage.getItem("kpiDone");
      const savedExpanded = localStorage.getItem("kpiExpanded");

      if (savedTrees) setTrees(JSON.parse(savedTrees));
      if (savedDone) setDone(JSON.parse(savedDone));
      if (savedExpanded) setExpanded(JSON.parse(savedExpanded));
    } catch (e) {
      console.error("Error loading:", e);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem("kpiTrees", JSON.stringify(trees));
      localStorage.setItem("kpiDone", JSON.stringify(done));
      localStorage.setItem("kpiExpanded", JSON.stringify(expanded));
    } catch (e) {
      console.error("Error saving:", e);
    }
  }, [trees, done, expanded, hydrated]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);

  const toggle = (id) => setDone((p) => ({ ...p, [id]: !p[id] }));
  const expand = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const totalT = trees.reduce((s, t) => s + totalNodes(t), 0);
  const doneT = trees.reduce((s, t) => s + doneNodes(t, done), 0);
  const pct = totalT ? Math.round((doneT / totalT) * 100) : 0;

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    setLoading(true);
    setChatLog((p) => [...p, { role: "user", text: msg }]);
    setView("chat");

    const ctx = trees.length
      ? `\nÁrboles actuales:\n${JSON.stringify(
          trees.map((t) => ({ title: t.title, icon: t.icon, children: t.children })),
          null,
          2
        )}`
      : "";

    const systemPrompt = `Eres un asistente de productividad. El usuario describe tareas.
Organiza todo en un árbol de KPI jerárquico.

REGLAS:
1. Responde SOLO con \`\`\`json ... \`\`\`
2. Formato:
{
  "trees": [
    {
      "title": "Nombre",
      "icon": "🎯",
      "progress": 0,
      "children": [...]
    }
  ]
}
3. Máximo 5 niveles.
4. Devuelve el conjunto COMPLETO.
5. Si completó algo, progress = 100.
${ctx}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: "user", content: msg }],
        }),
      });

      const data = await res.json();
      const newTrees = parseResponse(data.content);

      if (newTrees) {
        const stamped = newTrees.map((t) => stampIds(t, 0));
        setTrees(stamped);
        const exp = {};
        stamped.forEach((t) => {
          exp[t.id] = true;
          if (t.children) {
            t.children.forEach((c) => {
              exp[c.id] = true;
            });
          }
        });
        setExpanded((p) => ({ ...p, ...exp }));
        setChatLog((p) => [
          ...p,
          {
            role: "ai",
            text: `✨ ¡Listo! Organicé ${stamped.length} árbol${stamped.length > 1 ? "es" : ""} con ${stamped.reduce(
              (s, t) => s + totalNodes(t),
              0
            )} tareas. 💜`,
          },
        ]);
        setPulse(true);
        setTimeout(() => setPulse(false), 1200);
        setTimeout(() => setView("dashboard"), 1000);
      } else {
        setChatLog((p) => [
          ...p,
          { role: "ai", text: "No pude procesar eso. ¡Intenta otra vez! 🤔" },
        ]);
      }
    } catch (e) {
      console.error("Error:", e);
      setChatLog((p) => [...p, { role: "ai", text: "Error de conexión. ¡Intenta de nuevo! 🔄" }]);
    }
    setLoading(false);
  }

  function reset() {
    if (!window.confirm("¿Borrar TODO?")) return;
    setTrees([]);
    setDone({});
    setExpanded({});
    setChatLog([]);
    setMenuOpen(false);
    localStorage.removeItem("kpiTrees");
    localStorage.removeItem("kpiDone");
    localStorage.removeItem("kpiExpanded");
  }

  function Node({ node }) {
    const isExpanded = expanded[node.id];
    const isDone = done[node.id];
    const hasKids = node.children && node.children.length > 0;
    const kidsDone = hasKids ? node.children.reduce((s, c) => s + doneNodes(c, done), 0) : 0;
    const kidsTotal = hasKids ? node.children.reduce((s, c) => s + totalNodes(c), 0) : 0;
    const localPct = kidsTotal ? Math.round((kidsDone / kidsTotal) * 100) : isDone ? 100 : 0;

    return (
      <div style={{ marginLeft: node.level * 16, marginBottom: 8 }}>
        <div
          onClick={() => hasKids && expand(node.id)}
          style={{
            background: isDone ? "rgba(168,85,247,0.08)" : lvlGrad(node.level),
            borderRadius: 14,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: hasKids ? "pointer" : "default",
            opacity: isDone ? 0.65 : 1,
            boxShadow: isDone ? "none" : `0 4px 18px rgba(168,85,247,0.25)`,
            border: isDone ? `1px solid ${P.border}` : "1px solid rgba(255,255,255,0.12)",
            transition: "all 0.25s ease",
          }}
        >
          {hasKids ? (
            <div
              style={{
                color: "#fff",
                transition: "transform 0.25s",
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                flexShrink: 0,
              }}
            >
              <ChevronRight size={16} />
            </div>
          ) : (
            <div style={{ width: 16, flexShrink: 0 }} />
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.id);
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              flexShrink: 0,
              lineHeight: 0,
            }}
          >
            {isDone ? (
              <CheckCircle2 size={20} color="#fff" />
            ) : (
              <Circle size={20} color="rgba(255,255,255,0.7)" />
            )}
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 700,
                color: "#fff",
                textDecoration: isDone ? "line-through" : "none",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {node.title}
            </p>
            {hasKids && (
              <div style={{ height: 3, background: "rgba(0,0,0,0.2)", borderRadius: 4, marginTop: 4, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${localPct}%`,
                    background: "rgba(255,255,255,0.7)",
                    borderRadius: 4,
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
            )}
          </div>

          {hasKids && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#fff",
                background: "rgba(0,0,0,0.2)",
                borderRadius: 20,
                padding: "2px 7px",
                flexShrink: 0,
              }}
            >
              {localPct}%
            </span>
          )}
        </div>

        {isExpanded && hasKids && (
          <div style={{ marginTop: 6 }}>
            {node.children.map((c) => (
              <Node key={c.id} node={c} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!hydrated) return null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: P.bg,
        fontFamily: "'Poppins', sans-serif",
        color: P.txt,
        display: "flex",
        flexDirection: "column",
        maxWidth: 480,
        margin: "0 auto",
        position: "relative",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700;800&family=Syne:wght@700;800&display=swap');
        @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(168,85,247,0.6); } 50% { box-shadow: 0 0 0 18px rgba(168,85,247,0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0.2; } }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        textarea, input { font-family: 'Poppins', sans-serif; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(168,85,247,0.3); border-radius: 4px; }
      `}</style>

      <header
        style={{
          padding: "16px 20px",
          background: "rgba(15,10,30,0.95)",
          backdropFilter: "blur(16px)",
          borderBottom: `1px solid ${P.border}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 20,
              fontWeight: 800,
              background: `linear-gradient(135deg, ${P.p1}, ${P.p3})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            ✨ KPI Tracker
          </div>
          <div style={{ fontSize: 11, color: P.muted, marginTop: 1 }}>
            {totalT ? `${doneT} de ${totalT} tareas • ${pct}%` : "Escribe tus tareas 👇"}
          </div>
        </div>

        <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 30, padding: 3 }}>
          {["dashboard", "chat"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                background: view === v ? `linear-gradient(135deg,${P.p1},${P.p3})` : "none",
                border: "none",
                borderRadius: 24,
                padding: "5px 12px",
                color: view === v ? "#fff" : P.muted,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {v === "dashboard" ? "📊" : "💬"}
            </button>
          ))}
        </div>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "none",
            borderRadius: 10,
            padding: 8,
            color: P.txt,
            cursor: "pointer",
          }}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>

      {menuOpen && (
        <div
          style={{
            position: "fixed",
            top: 68,
            right: 16,
            background: "rgba(20,10,40,0.98)",
            backdropFilter: "blur(20px)",
            border: `1px solid ${P.border}`,
            borderRadius: 16,
            padding: 8,
            zIndex: 200,
            minWidth: 180,
            animation: "fadeSlideUp 0.2s ease-out",
            boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          }}
        >
          <button
            onClick={reset}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              background: "none",
              border: "none",
              color: "#f87171",
              padding: "10px 14px",
              borderRadius: 10,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <RotateCcw size={15} /> Reiniciar
          </button>
        </div>
      )}

      <main style={{ flex: 1, overflowY: "auto", padding: "16px 16px 140px" }}>
        {view === "dashboard" && (
          <div style={{ animation: "fadeSlideUp 0.35s ease-out" }}>
            {trees.length > 0 && (
              <div
                style={{
                  background: `linear-gradient(135deg, rgba(124,58,237,0.15), rgba(236,72,153,0.1))`,
                  border: `1px solid ${P.border}`,
                  borderRadius: 20,
                  padding: "20px",
                  marginBottom: 20,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  animation: pulse ? "pulse 0.6s ease" : "none",
                }}
              >
                <svg width={72} height={72} viewBox="0 0 72 72">
                  <circle cx={36} cy={36} r={30} fill="none" stroke="rgba(168,85,247,0.15)" strokeWidth={6} />
                  <circle
                    cx={36}
                    cy={36}
                    r={30}
                    fill="none"
                    stroke="url(#rg)"
                    strokeWidth={6}
                    strokeDasharray={`${2 * Math.PI * 30}`}
                    strokeDashoffset={`${2 * Math.PI * 30 * (1 - pct / 100)}`}
                    strokeLinecap="round"
                    transform="rotate(-90 36 36)"
                    style={{ transition: "stroke-dashoffset 0.6s ease" }}
                  />
                  <defs>
                    <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={P.p1} />
                      <stop offset="100%" stopColor={P.p3} />
                    </linearGradient>
                  </defs>
                  <text x={36} y={40} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800}>
                    {pct}%
                  </text>
                </svg>
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: P.txt }}>
                    Progreso Global
                  </div>
                  <div style={{ fontSize: 12, color: P.muted, marginTop: 2 }}>
                    {doneT} / {totalT} completadas
                  </div>
                </div>
              </div>
            )}

            {trees.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 24px" }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>🌱</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: P.txt, marginBottom: 8 }}>
                  ¡Dashboard vacío!
                </div>
                <div style={{ fontSize: 13, color: P.muted, lineHeight: 1.6 }}>
                  Escribe tus tareas abajo y yo las organizaré automáticamente. ✨
                </div>
                <button
                  onClick={() => {
                    setView("chat");
                    inputRef.current?.focus();
                  }}
                  style={{
                    marginTop: 24,
                    background: `linear-gradient(135deg,${P.p1},${P.p3})`,
                    border: "none",
                    borderRadius: 30,
                    padding: "12px 28px",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: "pointer",
                    boxShadow: "0 8px 24px rgba(168,85,247,0.35)",
                  }}
                >
                  Agregar tareas 🚀
                </button>
              </div>
            ) : (
              trees.map((tree) => (
                <div
                  key={tree.id}
                  style={{
                    background: P.card,
                    border: `1px solid ${P.border}`,
                    borderRadius: 20,
                    padding: 16,
                    marginBottom: 16,
                    animation: "fadeSlideUp 0.4s ease-out",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 14,
                      paddingBottom: 12,
                      borderBottom: `1px solid ${P.border}`,
                    }}
                  >
                    <span style={{ fontSize: 26 }}>{tree.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "'Syne',sans-serif",
                          fontWeight: 800,
                          fontSize: 15,
                          color: P.txt,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {tree.title}
                      </div>
                    </div>
                    <svg width={42} height={42} viewBox="0 0 42 42">
                      <circle cx={21} cy={21} r={17} fill="none" stroke="rgba(168,85,247,0.15)" strokeWidth={4} />
                      <circle
                        cx={21}
                        cy={21}
                        r={17}
                        fill="none"
                        stroke={P.p1}
                        strokeWidth={4}
                        strokeDasharray={`${2 * Math.PI * 17}`}
                        strokeDashoffset={`${
                          2 * Math.PI * 17 * (1 - (totalNodes(tree) ? doneNodes(tree, done) / totalNodes(tree) : 0))
                        }`}
                        strokeLinecap="round"
                        transform="rotate(-90 21 21)"
                        style={{ transition: "stroke-dashoffset 0.5s ease" }}
                      />
                      <text x={21} y={25} textAnchor="middle" fill="#fff" fontSize={9} fontWeight={800}>
                        {totalNodes(tree) ? Math.round((doneNodes(tree, done) / totalNodes(tree)) * 100) : 0}%
                      </text>
                    </svg>
                  </div>

                  {tree.children && tree.children.map((c) => (
                    <Node key={c.id} node={c} />
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {view === "chat" && (
          <div style={{ animation: "fadeSlideUp 0.35s ease-out" }}>
            {chatLog.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: 48 }}>💬</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: P.txt, marginTop: 12 }}>
                  ¡Cuéntame tus tareas!
                </div>
                <div style={{ fontSize: 12, color: P.muted, marginTop: 8, lineHeight: 1.7 }}>
                  Ejemplos:<br />
                  <span style={{ color: P.p1 }}>"Terminar proyecto, hacer mockups y presentar"</span>
                  <br />
                  <br />
                  o
                  <br />
                  <br />
                  <span style={{ color: P.p1 }}>"Completé los mockups"</span>
                </div>
              </div>
            ) : (
              chatLog.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                    marginBottom: 12,
                    animation: "fadeSlideUp 0.3s ease-out",
                  }}
                >
                  {m.role === "ai" && (
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: `linear-gradient(135deg,${P.p1},${P.p3})`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        marginRight: 8,
                        flexShrink: 0,
                        alignSelf: "flex-end",
                      }}
                    >
                      ✨
                    </div>
                  )}
                  <div
                    style={{
                      maxWidth: "78%",
                      background:
                        m.role === "user" ? `linear-gradient(135deg,${P.p1},${P.p1})` : "rgba(255,255,255,0.06)",
                      borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                      padding: "10px 14px",
                      fontSize: 13,
                      color: "#fff",
                      lineHeight: 1.5,
                      border: m.role === "ai" ? `1px solid ${P.border}` : "none",
                      boxShadow: m.role === "user" ? "0 4px 16px rgba(168,85,247,0.3)" : "none",
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: `linear-gradient(135deg,${P.p1},${P.p3})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                  }}
                >
                  ✨
                </div>
                <div
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: `1px solid ${P.border}`,
                    borderRadius: "18px 18px 18px 4px",
                    padding: "12px 18px",
                    display: "flex",
                    gap: 5,
                  }}
                >
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: P.p1,
                        animation: `blink 1.2s ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={chatEnd} />
          </div>
        )}
      </main>

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 480,
          background: "rgba(15,10,30,0.97)",
          backdropFilter: "blur(20px)",
          borderTop: `1px solid ${P.border}`,
          padding: "12px 16px 20px",
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.06)",
              border: `1px solid ${P.borderHi}`,
              borderRadius: 20,
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Sparkles size={15} color={P.p1} />
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Escribe tus tareas..."
              rows={1}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                color: P.txt,
                fontSize: 13,
                resize: "none",
                lineHeight: 1.5,
                maxHeight: 100,
                overflowY: "auto",
              }}
            />
          </div>
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              background:
                input.trim() && !loading ? `linear-gradient(135deg,${P.p1},${P.p3})` : "rgba(255,255,255,0.08)",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: input.trim() && !loading ? "pointer" : "not-allowed",
              boxShadow: input.trim() && !loading ? "0 4px 18px rgba(168,85,247,0.45)" : "none",
              transition: "all 0.25s",
              flexShrink: 0,
            }}
          >
            {loading ? (
              <div
                style={{
                  width: 18,
                  height: 18,
                  border: "2px solid #fff",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                }}
              />
            ) : (
              <Send size={18} color="#fff" />
            )}
          </button>
        </div>
        <div style={{ textAlign: "center", fontSize: 10, color: P.muted, marginTop: 8 }}>
          Presiona Enter para enviar
        </div>
      </div>
    </div>
  );
}
