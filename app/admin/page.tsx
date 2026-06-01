/* AICI INCEPE CODUL - app/admin/page.tsx */

"use client";

import { useEffect, useState } from "react";
import { supabase } from "../supabase";

const QUESTION_SECONDS = 15;
const ADMIN_EMAIL = "marian1983ionescu@gmail.com";

export default function AdminPage() {
  const [players, setPlayers] = useState<any[]>([]);
  const [winner, setWinner] = useState<any>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [adminEmail, setAdminEmail] = useState(ADMIN_EMAIL);
  const [adminPassword, setAdminPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [secondsUntilStart, setSecondsUntilStart] = useState(60);

  useEffect(() => {
    checkAdminSession();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    loadData();

    const interval = setInterval(async () => {
      await fetch("/api/game-loop");
      await loadData();
    }, 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  async function checkAdminSession() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.email === ADMIN_EMAIL) {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
      await supabase.auth.signOut();
    }

    setAuthLoading(false);
  }

  async function loginAdmin() {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: adminEmail.trim().toLowerCase(),
      password: adminPassword,
    });

    if (error || data.user?.email !== ADMIN_EMAIL) {
      alert("Acces refuzat.");
      await supabase.auth.signOut();
      return;
    }

    setIsAuthenticated(true);
    setAdminPassword("");
  }

  async function logoutAdmin() {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
  }

  async function loadData() {
    const { data: playersData } = await supabase
      .from("players")
      .select("*")
      .order("score", { ascending: false });

    const { data: winnerData } = await supabase
      .from("winners")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    const { data: gameData } = await supabase
      .from("game_state")
      .select("*")
      .eq("id", 1)
      .single();

    setPlayers(playersData || []);
    setWinner(winnerData?.[0] || null);
    setGameState(gameData);
  }

  async function generateQuestionOrder() {
    const { data: questions } = await supabase
      .from("public_questions")
      .select("id");

    if (!questions || questions.length === 0) return [];

    return [...questions]
      .sort(() => Math.random() - 0.5)
      .map((question) => question.id);
  }

  async function startLobby() {
    const questionOrder = await generateQuestionOrder();

    if (questionOrder.length === 0) {
      alert("Nu exista intrebari.");
      return;
    }

    const safeSeconds = Math.max(10, Number(secondsUntilStart) || 60);
    const now = new Date();
    const gameStart = new Date(now.getTime() + safeSeconds * 1000);

    await supabase
      .from("game_state")
      .update({
        is_running: false,
        current_question_index: 0,
        time_left: QUESTION_SECONDS,
        winner_name: null,
        show_result: false,
        last_winner_name: null,
        last_correct_answer: null,
        updated_at: now.toISOString(),
        lobby_start: now.toISOString(),
        game_start: gameStart.toISOString(),
        question_order: questionOrder,
      })
      .eq("id", 1);

    await loadData();
  }

  async function startGameNow() {
    const questionOrder = await generateQuestionOrder();

    if (questionOrder.length === 0) {
      alert("Nu exista intrebari.");
      return;
    }

    await supabase
      .from("game_state")
      .update({
        is_running: true,
        current_question_index: 0,
        time_left: QUESTION_SECONDS,
        winner_name: null,
        show_result: false,
        last_winner_name: null,
        last_correct_answer: null,
        updated_at: new Date().toISOString(),
        lobby_start: null,
        game_start: null,
        question_order: questionOrder,
      })
      .eq("id", 1);

    await loadData();
  }

  async function stopGame() {
    await supabase
      .from("game_state")
      .update({
        is_running: false,
        lobby_start: null,
        game_start: null,
      })
      .eq("id", 1);

    await loadData();
  }

  async function resetGame() {
    const resetKey = crypto.randomUUID();

    await supabase.from("answers").delete().neq("id", "");

    await supabase
      .from("players")
      .update({
        score: 0,
        is_active: false,
        session_id: null,
      })
      .not("id", "is", null);

    await supabase
      .from("game_state")
      .update({
        is_running: false,
        current_question_index: 0,
        time_left: QUESTION_SECONDS,
        winner_name: null,
        show_result: false,
        last_winner_name: null,
        last_correct_answer: null,
        updated_at: new Date().toISOString(),
        lobby_start: null,
        game_start: null,
        question_order: [],
        reset_key: resetKey,
      })
      .eq("id", 1);

    await loadData();
  }

  if (authLoading) {
    return <main style={centerPageStyle}>Se verifica accesul admin...</main>;
  }

  if (!isAuthenticated) {
    return (
      <main style={loginPageStyle}>
        <div style={loginBoxStyle}>
          <h1 style={loginTitleStyle}>Admin Login</h1>

          <input type="email" placeholder="Email admin" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} style={inputStyle} />

          <input type="password" placeholder="Parola" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loginAdmin()} style={{ ...inputStyle, marginBottom: "20px" }} />

          <button onClick={loginAdmin} style={loginButtonStyle}>
            LOGIN ADMIN
          </button>
        </div>
      </main>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={topBarStyle}>
        <h1 style={titleStyle}>Admin Panel</h1>
        <button onClick={logoutAdmin} style={buttonStyle("#ef4444")}>Logout</button>
      </div>

      <div style={controlsStyle}>
        <label style={labelStyle}>Porneste in secunde:</label>

        <input type="number" min="10" value={secondsUntilStart} onChange={(e) => setSecondsUntilStart(Number(e.target.value))} style={secondsInputStyle} />

        <button onClick={startLobby} style={buttonStyle("#22c55e")}>PORNESTE LOBBY</button>
        <button onClick={startGameNow} style={buttonStyle("#3b82f6")}>START ACUM</button>
        <button onClick={stopGame} style={buttonStyle("#ef4444")}>STOP JOC</button>
        <button onClick={resetGame} style={buttonStyle("#f59e0b")}>RESET TOTAL</button>
      </div>

      <div style={cardStyle}>
        <h2>Status joc</h2>
        <p>Ruleaza: <b>{gameState?.is_running ? "DA" : "NU"}</b></p>
        <p>Intrebarea: <b>{(gameState?.current_question_index || 0) + 1}</b></p>
        <p>Timp ramas: <b>{gameState?.time_left || 0}s</b></p>
        <p>Lobby start: <b>{gameState?.lobby_start || "-"}</b></p>
        <p>Game start: <b>{gameState?.game_start || "-"}</b></p>
        <p>Reset key: <b>{gameState?.reset_key || "-"}</b></p>
      </div>

      {winner && (
        <div style={winnerBoxStyle}>
          <h2>Ultimul castigator salvat</h2>
          <p style={winnerNameStyle}>{winner.player_name}</p>
          <p>Premiu: {winner.prize}</p>
        </div>
      )}

      <div style={cardStyle}>
        <h2>Clasament LIVE</h2>

        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Nume</th>
              <th style={thStyle}>Telefon</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Activ</th>
              <th style={thStyle}>Scor</th>
            </tr>
          </thead>

          <tbody>
            {players.map((player) => (
              <tr key={player.id}>
                <td style={tdStyle}>{player.name}</td>
                <td style={tdStyle}>{player.phone}</td>
                <td style={tdStyle}>{player.email}</td>
                <td style={tdStyle}>{player.is_active ? "DA" : "NU"}</td>
                <td style={tdStyle}>{player.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const centerPageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#050B2C",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  color: "white",
  fontSize: "28px",
};

const loginPageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#050B2C",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "20px",
};

const loginBoxStyle: React.CSSProperties = {
  background: "#18203A",
  padding: "40px",
  borderRadius: "20px",
  width: "100%",
  maxWidth: "420px",
};

const loginTitleStyle: React.CSSProperties = {
  color: "white",
  textAlign: "center",
  fontSize: "38px",
  marginBottom: "25px",
  fontWeight: "bold",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "16px",
  borderRadius: "12px",
  border: "none",
  fontSize: "18px",
  marginBottom: "15px",
  color: "#000000",
  background: "#ffffff",
};

const loginButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "16px",
  borderRadius: "12px",
  border: "none",
  background: "#2563eb",
  color: "white",
  fontSize: "20px",
  fontWeight: "bold",
  cursor: "pointer",
};

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#050B2C",
  color: "white",
  padding: "30px",
  fontFamily: "Arial",
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "25px",
  flexWrap: "wrap",
  gap: "15px",
};

const titleStyle: React.CSSProperties = {
  fontSize: "42px",
  fontWeight: "bold",
};

const controlsStyle: React.CSSProperties = {
  display: "flex",
  gap: "15px",
  marginBottom: "25px",
  flexWrap: "wrap",
  alignItems: "center",
};

const labelStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: "bold",
};

const secondsInputStyle: React.CSSProperties = {
  padding: "14px",
  borderRadius: "10px",
  border: "2px solid #ffffff",
  width: "150px",
  fontSize: "22px",
  color: "#000000",
  background: "#ffffff",
  fontWeight: "bold",
};

const cardStyle: React.CSSProperties = {
  background: "#18203A",
  padding: "22px",
  borderRadius: "18px",
  marginBottom: "25px",
};

const winnerBoxStyle: React.CSSProperties = {
  background: "#14532d",
  padding: "22px",
  borderRadius: "18px",
  marginBottom: "25px",
};

const winnerNameStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "bold",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: "15px",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px",
};

const tdStyle: React.CSSProperties = {
  padding: "10px",
};

function buttonStyle(background: string): React.CSSProperties {
  return {
    padding: "14px 22px",
    background,
    border: "none",
    borderRadius: "10px",
    color: "white",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: "17px",
  };
}

/* AICI SE TERMINA CODUL - app/admin/page.tsx */