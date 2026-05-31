"use client";

/* AICI INCEPE CODUL - app/admin/page.tsx */

import { useEffect, useState } from "react";
import { supabase } from "../supabase";

const QUESTION_SECONDS = 15;
const RESULT_SECONDS = 3;
const POINTS_TO_WIN = 10;
const ADMIN_PASSWORD = "suruburi2026";
const RECENT_LIMIT = 50;

export default function AdminPage() {
  const [players, setPlayers] = useState<any[]>([]);
  const [winner, setWinner] = useState<any>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [secondsUntilStart, setSecondsUntilStart] = useState(60);

  useEffect(() => {
    const savedAuth = localStorage.getItem("admin_auth");
    if (savedAuth === "true") setIsAuthenticated(true);
  }, []);

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
    const { data: questions } = await supabase.from("questions").select("id");

    const { data: game } = await supabase
      .from("game_state")
      .select("used_question_ids")
      .eq("id", 1)
      .single();

    if (!questions || questions.length === 0) return [];

    const recentIds = (game?.used_question_ids || []).slice(-RECENT_LIMIT);

    const freshQuestions = questions.filter(
      (question) => !recentIds.includes(question.id)
    );

    const pool =
      freshQuestions.length >= 10 ? freshQuestions : questions;

    const shuffled = [...pool].sort(() => Math.random() - 0.5);

    return shuffled.map((question) => question.id);
  }

  async function startLobby() {
    const questionOrder = await generateQuestionOrder();

    if (questionOrder.length === 0) {
      alert("Nu exista intrebari in tabela questions.");
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
      alert("Nu exista intrebari in tabela questions.");
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
    await supabase.from("players").update({ score: 0 }).gte("score", 0);
    await supabase.from("answers").delete().neq("id", "");
    await supabase.from("winners").delete().neq("id", "");

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

  async function processQuestionResults(game: any) {
    const questionOrder = game.question_order || [];
    const currentQuestionId = questionOrder[game.current_question_index];

    if (!currentQuestionId) return;

    const { data: currentQuestion } = await supabase
      .from("questions")
      .select("*")
      .eq("id", currentQuestionId)
      .single();

    if (!currentQuestion) return;

    const { data: answers } = await supabase
      .from("answers")
      .select("*")
      .eq("question_id", currentQuestion.id)
      .gte("answered_at", game.updated_at)
      .order("answered_at", { ascending: true });

    const firstCorrect = answers?.find(
      (answer) => answer.answer === currentQuestion.correct_answer
    );

    const oldUsedIds = game.used_question_ids || [];
    const newUsedIds = [...oldUsedIds, currentQuestion.id].slice(-RECENT_LIMIT);

    if (firstCorrect) {
      const { data: playerData } = await supabase
        .from("players")
        .select("*")
        .eq("phone", firstCorrect.phone)
        .single();

      if (playerData) {
        const newScore = (playerData.score || 0) + 1;

        await supabase
          .from("players")
          .update({ score: newScore })
          .eq("phone", firstCorrect.phone);

        if (newScore >= POINTS_TO_WIN) {
          await supabase.from("winners").insert([
            {
              player_name: playerData.name,
              prize: "100 LEI",
            },
          ]);

          await supabase
            .from("game_state")
            .update({
              is_running: false,
              winner_name: playerData.name,
              show_result: true,
              last_winner_name: playerData.name,
              last_correct_answer: currentQuestion.correct_answer,
              lobby_start: null,
              game_start: null,
              used_question_ids: newUsedIds,
            })
            .eq("id", 1);

          return;
        }

        await supabase
          .from("game_state")
          .update({
            show_result: true,
            last_winner_name: playerData.name,
            last_correct_answer: currentQuestion.correct_answer,
            used_question_ids: newUsedIds,
          })
          .eq("id", 1);
      }
    } else {
      await supabase
        .from("game_state")
        .update({
          show_result: true,
          last_winner_name: "Nimeni",
          last_correct_answer: currentQuestion.correct_answer,
          used_question_ids: newUsedIds,
        })
        .eq("id", 1);
    }

    setTimeout(async () => {
      const nextIndex =
        game.current_question_index + 1 >= questionOrder.length
          ? 0
          : game.current_question_index + 1;

      await supabase
        .from("game_state")
        .update({
          current_question_index: nextIndex,
          time_left: QUESTION_SECONDS,
          show_result: false,
          last_winner_name: null,
          last_correct_answer: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      await loadData();
    }, RESULT_SECONDS * 1000);
  }

  useEffect(() => {
    if (!isAuthenticated) return;

    loadData();

    const interval = setInterval(async () => {
      const { data: game } = await supabase
        .from("game_state")
        .select("*")
        .eq("id", 1)
        .single();

      if (!game) return;

      setGameState(game);

      const nowMs = Date.now();
      const gameStartMs = game.game_start
        ? new Date(game.game_start).getTime()
        : null;

      if (
        gameStartMs &&
        !game.is_running &&
        !game.winner_name &&
        nowMs >= gameStartMs
      ) {
        await supabase
          .from("game_state")
          .update({
            is_running: true,
            time_left: QUESTION_SECONDS,
            current_question_index: 0,
            show_result: false,
            last_winner_name: null,
            last_correct_answer: null,
            updated_at: new Date().toISOString(),
            lobby_start: null,
            game_start: null,
          })
          .eq("id", 1);

        await loadData();
        return;
      }

      if (!game.is_running || game.winner_name || game.show_result) {
        await loadData();
        return;
      }

      if (game.time_left <= 0) {
        await processQuestionResults(game);
        await loadData();
        return;
      }

      await supabase
        .from("game_state")
        .update({
          time_left: game.time_left - 1,
        })
        .eq("id", 1);

      await loadData();
    }, 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  function loginAdmin() {
    if (password === ADMIN_PASSWORD) {
      localStorage.setItem("admin_auth", "true");
      setIsAuthenticated(true);
    } else {
      alert("Parola gresita.");
    }
  }

  function logoutAdmin() {
    localStorage.removeItem("admin_auth");
    setIsAuthenticated(false);
  }

  if (!isAuthenticated) {
    return (
      <main style={{ minHeight: "100vh", background: "#050B2C", display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
        <div style={{ background: "#18203A", padding: "40px", borderRadius: "20px", width: "100%", maxWidth: "420px" }}>
          <h1 style={{ color: "white", textAlign: "center", fontSize: "38px", marginBottom: "25px", fontWeight: "bold" }}>
            Admin Login
          </h1>

          <input
            type="password"
            placeholder="Parola admin"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: "16px", borderRadius: "12px", border: "none", fontSize: "18px", marginBottom: "20px" }}
          />

          <button
            onClick={loginAdmin}
            style={{ width: "100%", padding: "16px", borderRadius: "12px", border: "none", background: "#2563eb", color: "white", fontSize: "20px", fontWeight: "bold", cursor: "pointer" }}
          >
            LOGIN
          </button>
        </div>
      </main>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#050B2C", color: "white", padding: "30px", fontFamily: "Arial" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "25px", flexWrap: "wrap", gap: "15px" }}>
        <h1 style={{ fontSize: "42px", fontWeight: "bold" }}>Admin Panel</h1>

        <button
          onClick={logoutAdmin}
          style={{ padding: "12px 18px", background: "#ef4444", border: "none", borderRadius: "10px", color: "white", fontWeight: "bold", cursor: "pointer", fontSize: "16px" }}
        >
          Logout
        </button>
      </div>

      <div style={{ display: "flex", gap: "15px", marginBottom: "25px", flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: "18px", fontWeight: "bold" }}>
          Porneste in secunde:
        </label>

        <input
          type="number"
          min="10"
          value={secondsUntilStart}
          onChange={(e) => setSecondsUntilStart(Number(e.target.value))}
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

        <button onClick={startLobby} style={{ padding: "14px 22px", background: "#22c55e", border: "none", borderRadius: "10px", color: "white", fontWeight: "bold", cursor: "pointer", fontSize: "17px" }}>
          PORNESTE LOBBY
        </button>

        <button onClick={startGameNow} style={{ padding: "14px 22px", background: "#3b82f6", border: "none", borderRadius: "10px", color: "white", fontWeight: "bold", cursor: "pointer", fontSize: "17px" }}>
          START ACUM
        </button>

        <button onClick={stopGame} style={{ padding: "14px 22px", background: "#ef4444", border: "none", borderRadius: "10px", color: "white", fontWeight: "bold", cursor: "pointer", fontSize: "17px" }}>
          STOP JOC
        </button>

        <button onClick={resetGame} style={{ padding: "14px 22px", background: "#f59e0b", border: "none", borderRadius: "10px", color: "white", fontWeight: "bold", cursor: "pointer", fontSize: "17px" }}>
          RESET TOTAL
        </button>
      </div>

      <div style={{ background: "#18203A", padding: "22px", borderRadius: "18px", marginBottom: "25px" }}>
        <h2>Status joc</h2>
        <p>Ruleaza: <b>{gameState?.is_running ? "DA" : "NU"}</b></p>
        <p>Intrebarea: <b>{(gameState?.current_question_index || 0) + 1}</b></p>
        <p>Timp ramas: <b>{gameState?.time_left || 0}s</b></p>
        <p>Intrebari in ordine random: <b>{gameState?.question_order?.length || 0}</b></p>
        <p>Intrebari recente blocate: <b>{gameState?.used_question_ids?.length || 0}</b></p>
        <p>Lobby start: <b>{gameState?.lobby_start || "-"}</b></p>
        <p>Game start: <b>{gameState?.game_start || "-"}</b></p>
        <p>Rezultat afisat: <b>{gameState?.show_result ? "DA" : "NU"}</b></p>
      </div>

      {winner && (
        <div style={{ background: "#14532d", padding: "22px", borderRadius: "18px", marginBottom: "25px" }}>
          <h2>Castigator</h2>
          <p style={{ fontSize: "24px", fontWeight: "bold" }}>{winner.player_name}</p>
          <p>Premiu: {winner.prize}</p>
        </div>
      )}

      <div style={{ background: "#18203A", padding: "22px", borderRadius: "18px" }}>
        <h2>Clasament LIVE</h2>

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "15px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px" }}>Nume</th>
              <th style={{ textAlign: "left", padding: "10px" }}>Telefon</th>
              <th style={{ textAlign: "left", padding: "10px" }}>Email</th>
              <th style={{ textAlign: "left", padding: "10px" }}>Scor</th>
            </tr>
          </thead>

          <tbody>
            {players.map((player) => (
              <tr key={player.id}>
                <td style={{ padding: "10px" }}>{player.name}</td>
                <td style={{ padding: "10px" }}>{player.phone}</td>
                <td style={{ padding: "10px" }}>{player.email}</td>
                <td style={{ padding: "10px" }}>{player.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* AICI SE TERMINA CODUL - app/admin/page.tsx */