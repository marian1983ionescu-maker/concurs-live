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
      .from("questions")
      .select("id");

    if (!questions || questions.length === 0) return [];

    const shuffled = [...questions].sort(() => Math.random() - 0.5);

    return shuffled.map((question) => question.id);
  }

  async function startLobby() {
    const questionOrder = await generateQuestionOrder();

    if (questionOrder.length === 0) {
      alert("Nu exista intrebari.");
      return;
    }

    const safeSeconds = Math.max(10, Number(secondsUntilStart) || 60);

    const now = new Date();

    const gameStart = new Date(
      now.getTime() + safeSeconds * 1000
    );

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
    await supabase
      .from("players")
      .update({ score: 0 })
      .gte("score", 0);

    await supabase
      .from("answers")
      .delete()
      .neq("id", "");

    await supabase
      .from("winners")
      .delete()
      .neq("id", "");

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
      })
      .eq("id", 1);

    await loadData();
  }

  if (authLoading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#050B2C",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          color: "white",
          fontSize: "28px",
        }}
      >
        Se verifica accesul admin...
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#050B2C",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "20px",
        }}
      >
        <div
          style={{
            background: "#18203A",
            padding: "40px",
            borderRadius: "20px",
            width: "100%",
            maxWidth: "420px",
          }}
        >
          <h1
            style={{
              color: "white",
              textAlign: "center",
              fontSize: "38px",
              marginBottom: "25px",
              fontWeight: "bold",
            }}
          >
            Admin Login
          </h1>

          <input
            type="email"
            placeholder="Email admin"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: "12px",
              border: "none",
              fontSize: "18px",
              marginBottom: "15px",
              color: "#000000",
              background: "#ffffff",
            }}
          />

          <input
            type="password"
            placeholder="Parola"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loginAdmin();
            }}
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: "12px",
              border: "none",
              fontSize: "18px",
              marginBottom: "20px",
              color: "#000000",
              background: "#ffffff",
            }}
          />

          <button
            onClick={loginAdmin}
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: "12px",
              border: "none",
              background: "#2563eb",
              color: "white",
              fontSize: "20px",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            LOGIN ADMIN
          </button>
        </div>
      </main>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#050B2C",
        color: "white",
        padding: "30px",
        fontFamily: "Arial",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "25px",
          flexWrap: "wrap",
          gap: "15px",
        }}
      >
        <h1
          style={{
            fontSize: "42px",
            fontWeight: "bold",
          }}
        >
          Admin Panel
        </h1>

        <button
          onClick={logoutAdmin}
          style={{
            padding: "12px 18px",
            background: "#ef4444",
            border: "none",
            borderRadius: "10px",
            color: "white",
            fontWeight: "bold",
            cursor: "pointer",
            fontSize: "16px",
          }}
        >
          Logout
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: "15px",
          marginBottom: "25px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <label
          style={{
            fontSize: "18px",
            fontWeight: "bold",
          }}
        >
          Porneste in secunde:
        </label>

        <input
          type="number"
          min="10"
          value={secondsUntilStart}
          onChange={(e) =>
            setSecondsUntilStart(Number(e.target.value))
          }
          style={{
            padding: "14px",
            borderRadius: "10px",
            border: "2px solid #ffffff",
            width: "150px",
            fontSize: "22px",
            color: "#000000",
            background: "#ffffff",
            fontWeight: "bold",
          }}
        />

        <button
          onClick={startLobby}
          style={{
            padding: "14px 22px",
            background: "#22c55e",
            border: "none",
            borderRadius: "10px",
            color: "white",
            fontWeight: "bold",
            cursor: "pointer",
            fontSize: "17px",
          }}
        >
          PORNESTE LOBBY
        </button>

        <button
          onClick={startGameNow}
          style={{
            padding: "14px 22px",
            background: "#3b82f6",
            border: "none",
            borderRadius: "10px",
            color: "white",
            fontWeight: "bold",
            cursor: "pointer",
            fontSize: "17px",
          }}
        >
          START ACUM
        </button>

        <button
          onClick={stopGame}
          style={{
            padding: "14px 22px",
            background: "#ef4444",
            border: "none",
            borderRadius: "10px",
            color: "white",
            fontWeight: "bold",
            cursor: "pointer",
            fontSize: "17px",
          }}
        >
          STOP JOC
        </button>

        <button
          onClick={resetGame}
          style={{
            padding: "14px 22px",
            background: "#f59e0b",
            border: "none",
            borderRadius: "10px",
            color: "white",
            fontWeight: "bold",
            cursor: "pointer",
            fontSize: "17px",
          }}
        >
          RESET TOTAL
        </button>
      </div>

      <div
        style={{
          background: "#18203A",
          padding: "22px",
          borderRadius: "18px",
          marginBottom: "25px",
        }}
      >
        <h2>Status joc</h2>

        <p>
          Ruleaza:{" "}
          <b>{gameState?.is_running ? "DA" : "NU"}</b>
        </p>

        <p>
          Intrebarea:{" "}
          <b>
            {(gameState?.current_question_index || 0) + 1}
          </b>
        </p>

        <p>
          Timp ramas:{" "}
          <b>{gameState?.time_left || 0}s</b>
        </p>

        <p>
          Lobby start:{" "}
          <b>{gameState?.lobby_start || "-"}</b>
        </p>

        <p>
          Game start:{" "}
          <b>{gameState?.game_start || "-"}</b>
        </p>
      </div>

      {winner && (
        <div
          style={{
            background: "#14532d",
            padding: "22px",
            borderRadius: "18px",
            marginBottom: "25px",
          }}
        >
          <h2>Castigator</h2>

          <p
            style={{
              fontSize: "24px",
              fontWeight: "bold",
            }}
          >
            {winner.player_name}
          </p>

          <p>Premiu: {winner.prize}</p>
        </div>
      )}

      <div
        style={{
          background: "#18203A",
          padding: "22px",
          borderRadius: "18px",
        }}
      >
        <h2>Clasament LIVE</h2>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: "15px",
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px" }}>
                Nume
              </th>

              <th style={{ textAlign: "left", padding: "10px" }}>
                Telefon
              </th>

              <th style={{ textAlign: "left", padding: "10px" }}>
                Email
              </th>

              <th style={{ textAlign: "left", padding: "10px" }}>
                Scor
              </th>
            </tr>
          </thead>

          <tbody>
            {players.map((player) => (
              <tr key={player.id}>
                <td style={{ padding: "10px" }}>
                  {player.name}
                </td>

                <td style={{ padding: "10px" }}>
                  {player.phone}
                </td>

                <td style={{ padding: "10px" }}>
                  {player.email}
                </td>

                <td style={{ padding: "10px" }}>
                  {player.score}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* AICI SE TERMINA CODUL - app/admin/page.tsx */