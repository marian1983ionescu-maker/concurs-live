/* AICI INCEPE CODUL - app/page.tsx */

"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { supabase } from "./supabase";

type Question = {
  id: string;
  question: string;
  answer_1: string;
  answer_2: string;
  answer_3: string;
  answer_4: string;
};

type Player = {
  id: string;
  name: string;
  phone: string;
  email: string;
  score: number;
};

type GameState = {
  id: number;
  current_question_index: number;
  time_left: number;
  is_running: boolean;
  winner_name: string | null;
  show_result: boolean;
  last_winner_name: string | null;
  last_correct_answer: string | null;
  updated_at: string;
  lobby_start: string | null;
  game_start: string | null;
  question_order: string[];
};

export default function Home() {
  const [questionsMap, setQuestionsMap] = useState<Record<string, Question>>({});
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);

  const [playerName, setPlayerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);

  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [answerSent, setAnswerSent] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const currentQuestionId =
    gameState?.question_order?.[gameState.current_question_index || 0];

  const currentQuestion = currentQuestionId
    ? questionsMap[currentQuestionId]
    : null;

  const countdownToGame = useMemo(() => {
    if (!gameState?.game_start) return null;

    const target = new Date(gameState.game_start).getTime();

    if (Number.isNaN(target)) return null;

    return Math.max(0, Math.ceil((target - nowMs) / 1000));
  }, [gameState?.game_start, nowMs]);

  useEffect(() => {
    const savedPlayer = localStorage.getItem("concurs_player");

    if (savedPlayer) {
      const player = JSON.parse(savedPlayer);

      setPlayerName(player.name || "");
      setPhone(player.phone || "");
      setEmail(player.email || "");
      setJoined(true);
    }

    loadQuestions();
    loadPlayers();
    loadGameState();

    const clock = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    const playersChannel = supabase
      .channel("players-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        () => loadPlayers()
      )
      .subscribe();

    const gameChannel = supabase
      .channel("game-state-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_state" },
        () => {
          loadGameState();
          loadPlayers();
        }
      )
      .subscribe();

    return () => {
      clearInterval(clock);

      supabase.removeChannel(playersChannel);
      supabase.removeChannel(gameChannel);
    };
  }, []);

  useEffect(() => {
    checkExistingAnswer();
  }, [
    gameState?.current_question_index,
    gameState?.updated_at,
    phone,
    currentQuestionId,
  ]);

  async function loadQuestions() {
    const { data } = await supabase.from("public_questions").select("*");

    if (data) {
      const map: Record<string, Question> = {};

      data.forEach((question) => {
        map[question.id] = question;
      });

      setQuestionsMap(map);
    }
  }

  async function loadPlayers() {
    const { data } = await supabase
      .from("players")
      .select("*")
      .order("score", { ascending: false });

    if (data) {
      setPlayers(data);
    }
  }

  async function loadGameState() {
    const { data } = await supabase
      .from("game_state")
      .select("*")
      .eq("id", 1)
      .single();

    if (data) {
      setGameState(data);
    }
  }

  async function checkExistingAnswer() {
    if (!phone || !currentQuestion || !gameState?.updated_at) return;

    const { data } = await supabase
      .from("answers")
      .select("*")
      .eq("phone", phone)
      .eq("question_id", currentQuestion.id)
      .gte("answered_at", gameState.updated_at)
      .limit(1);

    if (data && data.length > 0) {
      setSelectedAnswer(data[0].answer);
      setAnswerSent(true);
    } else {
      setSelectedAnswer("");
      setAnswerSent(false);
    }
  }

  async function joinGame() {
    const phoneClean = phone.replace(/\s+/g, "");
    const emailClean = email.trim().toLowerCase();
    const nameClean = playerName.trim();

    const phoneRegex = /^07[0-9]{8}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    if (!nameClean) {
      alert("Completeaza numele complet.");
      return;
    }

    if (!phoneRegex.test(phoneClean)) {
      alert("Telefon invalid.");
      return;
    }

    if (!emailRegex.test(emailClean)) {
      alert("Email invalid.");
      return;
    }

    const ipResponse = await fetch("/api/client-ip");
    const ipData = await ipResponse.json();

    const userIp = ipData.ip || "necunoscut";

    const { data: existingIp } = await supabase
      .from("players")
      .select("*")
      .eq("ip_address", userIp)
      .limit(1);

    if (existingIp && existingIp.length > 0) {
      alert("Exista deja un cont creat de pe acest IP.");
      return;
    }

    const { data: existingPhone } = await supabase
      .from("players")
      .select("*")
      .eq("phone", phoneClean)
      .limit(1);

    if (existingPhone && existingPhone.length > 0) {
      alert("Acest numar de telefon este deja folosit.");
      return;
    }

    localStorage.setItem(
      "concurs_player",
      JSON.stringify({
        name: nameClean,
        phone: phoneClean,
        email: emailClean,
      })
    );

    await supabase.from("players").insert([
      {
        name: nameClean,
        phone: phoneClean,
        email: emailClean,
        ip_address: userIp,
        score: 0,
      },
    ]);

    setPlayerName(nameClean);
    setPhone(phoneClean);
    setEmail(emailClean);
    setJoined(true);

    loadPlayers();
  }

  async function handleAnswer(answer: string) {
    if (
      !currentQuestion ||
      !gameState?.is_running ||
      gameState.show_result ||
      answerSent ||
      gameState.time_left <= 0
    ) {
      return;
    }

    setSelectedAnswer(answer);
    setAnswerSent(true);

    await supabase.from("answers").insert([
      {
        player_name: playerName,
        phone,
        email,
        question_id: currentQuestion.id,
        answer,
        is_correct: false,
      },
    ]);
  }

  function formatCountdown(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
        2,
        "0"
      )}:${String(seconds).padStart(2, "0")}`;
    }

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  }

  if (!joined) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#020617] via-[#07153a] to-[#020617] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#101b3b]/90 backdrop-blur-xl border border-blue-500/20 rounded-[35px] p-8 shadow-[0_0_80px_rgba(37,99,235,0.25)]">

          <div className="flex justify-center mb-5">
            <Image
              src="/logo.jpg"
              alt="logo"
              width={180}
              height={180}
              className="rounded-2xl"
            />
          </div>

          <h1 className="text-white text-3xl font-black text-center leading-tight">
            Concurs LIVE
          </h1>

          <p className="text-blue-300 text-center mt-2 text-lg">
            Suruburi-Holsuruburi.RO
          </p>

          <div className="mt-7 flex flex-col gap-4">

            <input
              className="bg-[#1b2952] border border-blue-400/20 text-white p-4 rounded-2xl text-lg outline-none focus:border-blue-400"
              placeholder="Nume complet"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
            />

            <input
              className="bg-[#1b2952] border border-blue-400/20 text-white p-4 rounded-2xl text-lg outline-none focus:border-blue-400"
              placeholder="Telefon"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            <input
              className="bg-[#1b2952] border border-blue-400/20 text-white p-4 rounded-2xl text-lg outline-none focus:border-blue-400"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <button
              onClick={joinGame}
              className="bg-gradient-to-r from-blue-600 to-blue-500 hover:scale-[1.02] transition-all text-white p-4 rounded-2xl text-xl font-black shadow-lg shadow-blue-600/30"
            >
              INTRA IN JOC
            </button>

          </div>
        </div>
      </main>
    );
  }

  if (!gameState || Object.keys(questionsMap).length === 0) {
    return (
      <main className="min-h-screen bg-[#020617] flex items-center justify-center text-white text-3xl font-bold">
        Se incarca jocul...
      </main>
    );
  }

  if (gameState.winner_name) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#020617] via-[#07153a] to-[#020617] flex items-center justify-center p-4 text-white">
        <div className="bg-[#101b3b]/90 border border-green-400/30 shadow-[0_0_100px_rgba(34,197,94,0.35)] rounded-[40px] p-10 text-center max-w-3xl">

          <div className="flex justify-center mb-6">
            <Image
              src="/logo.jpg"
              alt="logo"
              width={170}
              height={170}
              className="rounded-2xl"
            />
          </div>

          <h1 className="text-5xl font-black text-green-400 leading-tight">
            {gameState.winner_name}
          </h1>

          <p className="text-3xl mt-5 font-bold text-white">
            A castigat premiul de 100 LEI!
          </p>

          <p className="text-xl mt-6 text-blue-200">
            Urmatorul joc va incepe in curand.
          </p>

        </div>
      </main>
    );
  }

  const hasActiveLobby =
    !gameState.is_running &&
    !!gameState.game_start &&
    countdownToGame !== null &&
    countdownToGame > 0;

  if (hasActiveLobby) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#020617] via-[#07153a] to-[#020617] flex items-center justify-center p-4 text-white">

        <div className="bg-[#101b3b]/90 border border-blue-400/20 shadow-[0_0_80px_rgba(37,99,235,0.25)] rounded-[40px] p-10 text-center max-w-3xl">

          <div className="flex justify-center mb-6">
            <Image
              src="/logo.jpg"
              alt="logo"
              width={170}
              height={170}
              className="rounded-2xl"
            />
          </div>

          <h1 className="text-5xl font-black text-blue-300 mb-6">
            Lobby LIVE
          </h1>

          <p className="text-2xl mb-6">
            Concursul incepe in:
          </p>

          <div className="bg-[#020617] rounded-[35px] p-8 mb-6 border border-green-400/20 shadow-[0_0_70px_rgba(34,197,94,0.2)]">
            <p className="text-7xl font-black text-green-400">
              {formatCountdown(countdownToGame)}
            </p>
          </div>

          <p className="text-xl text-blue-100">
            Ramai pe pagina. Jocul porneste automat.
          </p>

        </div>

      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#020617] via-[#07153a] to-[#020617] text-white p-4 flex flex-col items-center overflow-hidden">

      <div className="flex flex-col items-center mt-2">
        <Image
          src="/logo.jpg"
          alt="logo"
          width={120}
          height={120}
          className="rounded-2xl shadow-[0_0_50px_rgba(37,99,235,0.35)]"
        />

        <h1 className="text-4xl md:text-5xl font-black text-center mt-4">
          Concurs LIVE
        </h1>

        <p className="text-blue-300 text-lg mt-2 text-center">
          Suruburi-Holsuruburi.RO
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-6 w-full max-w-7xl">

        <section className="lg:col-span-2 bg-[#101b3b]/90 border border-blue-400/20 rounded-[35px] p-6 shadow-[0_0_70px_rgba(37,99,235,0.15)]">

          <div className="flex justify-between items-center gap-3 flex-wrap">

            <div className="bg-[#1b2952] px-5 py-3 rounded-2xl">
              <p className="text-sm text-blue-200">Jucator</p>
              <p className="text-xl font-black">{playerName}</p>
            </div>

            <div className="bg-[#1b2952] px-5 py-3 rounded-2xl text-center">
              <p className="text-sm text-blue-200">Intrebarea</p>
              <p className="text-3xl font-black">
                {(gameState.current_question_index || 0) + 1}
              </p>
            </div>

            <div className="bg-[#220f17] px-5 py-3 rounded-2xl text-center border border-red-400/20">
              <p className="text-sm text-red-200">Timp ramas</p>
              <p className="text-3xl font-black text-red-400">
                {gameState.time_left}s
              </p>
            </div>

          </div>

          <div className="bg-[#1b2952] border border-blue-400/10 rounded-[30px] p-7 mt-6 min-h-[150px] flex items-center justify-center">
            <h2 className="text-2xl md:text-3xl text-center font-black leading-snug">
              {currentQuestion?.question}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">

            {[
              currentQuestion?.answer_1,
              currentQuestion?.answer_2,
              currentQuestion?.answer_3,
              currentQuestion?.answer_4,
            ].map((answer) => (
              <button
                key={answer}
                onClick={() => answer && handleAnswer(answer)}
                disabled={answerSent || gameState.show_result}
                className={`p-5 rounded-[24px] text-xl font-black transition-all min-h-[85px] border ${
                  selectedAnswer === answer
                    ? "bg-yellow-400 text-black border-yellow-200 scale-[1.02]"
                    : answerSent || gameState.show_result
                    ? "bg-gray-600 text-white border-gray-500"
                    : "bg-blue-600 hover:bg-blue-500 hover:scale-[1.02] border-blue-400/20"
                }`}
              >
                {answer}
              </button>
            ))}

          </div>

          {answerSent && !gameState.show_result && (
            <div className="bg-[#02122e] border border-yellow-400/20 mt-5 p-5 rounded-[24px] text-center">
              <p className="text-yellow-300 text-2xl font-black">
                Raspuns trimis!
              </p>
            </div>
          )}

          {gameState.show_result && (
            <div className="bg-[#052e16] border border-green-400/20 mt-5 p-5 rounded-[24px] text-center">

              <p className="text-green-300 text-2xl font-black">
                Raspuns corect:
              </p>

              <p className="text-white text-3xl font-black mt-2">
                {gameState.last_correct_answer}
              </p>

              <p className="text-green-200 text-xl font-bold mt-4">
                {gameState.last_winner_name === "Nimeni"
                  ? "Nimeni nu a raspuns corect."
                  : `${gameState.last_winner_name} a raspuns primul corect.`}
              </p>

            </div>
          )}

        </section>

        <aside className="bg-[#101b3b]/90 border border-blue-400/20 rounded-[35px] p-5 max-h-[78vh] overflow-auto shadow-[0_0_70px_rgba(37,99,235,0.15)]">

          <h2 className="text-3xl font-black mb-5 text-center text-blue-300">
            Clasament LIVE
          </h2>

          <div className="flex flex-col gap-3">

            {players.map((player, index) => (
              <div
                key={player.id}
                className={`rounded-[24px] p-4 flex justify-between items-center border ${
                  index === 0
                    ? "bg-gradient-to-r from-yellow-500 to-yellow-400 text-black border-yellow-200"
                    : "bg-[#1b2952] border-blue-400/10"
                }`}
              >

                <div className="text-base font-black">
                  #{index + 1} - {player.name}
                </div>

                <div className="text-base font-black">
                  {player.score} puncte
                </div>

              </div>
            ))}

          </div>

        </aside>

      </div>

    </main>
  );
}

/* AICI SE TERMINA CODUL - app/page.tsx */