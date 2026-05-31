/* AICI INCEPE CODUL - app/page.tsx */

"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [questionsMap, setQuestionsMap] = useState<Record<string, Question>>(
    {}
  );

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
        {
          event: "*",
          schema: "public",
          table: "players",
        },
        () => loadPlayers()
      )
      .subscribe();

    const gameChannel = supabase
      .channel("game-state-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_state",
        },
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
    const { data } = await supabase
      .from("public_questions")
      .select("*");

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
    if (!phone || !currentQuestion || !gameState?.updated_at) {
      return;
    }

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
    if (!playerName.trim() || !phone.trim() || !email.trim()) {
      alert("Completeaza toate campurile.");
      return;
    }

    localStorage.setItem(
      "concurs_player",
      JSON.stringify({
        name: playerName,
        phone,
        email,
      })
    );

    const { data: existingPlayers } = await supabase
      .from("players")
      .select("*")
      .eq("phone", phone)
      .limit(1);

    if (!existingPlayers || existingPlayers.length === 0) {
      await supabase.from("players").insert([
        {
          name: playerName,
          phone,
          email,
          score: 0,
        },
      ]);
    }

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
      <main className="min-h-screen bg-[#0b1333] flex items-center justify-center p-4">
        <div className="bg-[#202944] p-8 rounded-3xl w-full max-w-md">
          <h1 className="text-white text-3xl font-bold text-center leading-tight">
            Concurs Suruburi-Holsuruburi.RO
          </h1>

          <p className="text-yellow-400 text-center mt-5 text-lg">
            Completeaza datele pentru a participa.
          </p>

          <div className="mt-7 flex flex-col gap-4">
            <input
              className="bg-white text-black p-4 rounded-xl text-lg"
              placeholder="Nume complet"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
            />

            <input
              className="bg-white text-black p-4 rounded-xl text-lg"
              placeholder="Telefon"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            <input
              className="bg-white text-black p-4 rounded-xl text-lg"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <button
              onClick={joinGame}
              className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl text-xl font-bold"
            >
              Continua
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!gameState || Object.keys(questionsMap).length === 0) {
    return (
      <main className="min-h-screen bg-[#0b1333] flex items-center justify-center text-white text-2xl">
        Se incarca jocul...
      </main>
    );
  }

  if (gameState.winner_name) {
    return (
      <main className="min-h-screen bg-[#0b1333] flex items-center justify-center p-4 text-white">
        <div className="bg-[#202944] rounded-3xl p-10 text-center max-w-3xl">
          <h1 className="text-4xl font-bold text-yellow-400">
            {gameState.winner_name} a castigat concursul si premiul de 100 LEI!
          </h1>

          <p className="text-2xl mt-6">
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
      <main className="min-h-screen bg-[#0b1333] flex items-center justify-center p-4 text-white">
        <div className="bg-[#202944] rounded-3xl p-10 text-center max-w-3xl">
          <h1 className="text-4xl font-bold text-yellow-400 mb-6">
            Lobby concurs
          </h1>

          <p className="text-2xl mb-6">
            Concursul incepe in:
          </p>

          <div className="bg-[#020617] rounded-3xl p-8 mb-6">
            <p className="text-7xl font-bold text-green-400">
              {formatCountdown(countdownToGame)}
            </p>
          </div>

          <p className="text-xl text-gray-300">
            Ramai pe pagina. Jocul porneste automat.
          </p>
        </div>
      </main>
    );
  }

  if (!gameState.is_running) {
    return (
      <main className="min-h-screen bg-[#0b1333] flex items-center justify-center p-4 text-white">
        <div className="bg-[#202944] rounded-3xl p-10 text-center max-w-3xl">
          <h1 className="text-4xl font-bold text-yellow-400 mb-6">
            Esti inscris in joc, {playerName}!
          </h1>

          <p className="text-2xl">
            Jocul nu este programat inca.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b1333] text-white p-4 flex flex-col items-center overflow-hidden">
      <h1 className="text-4xl font-bold text-center mt-2">
        Concurs Suruburi-Holsuruburi.RO
      </h1>

      <p className="text-lg mt-3 text-center">
        Toti jucatorii vad aceeasi intrebare live.
      </p>

      <p className="text-yellow-400 text-lg mt-1 text-center">
        Primul raspuns corect castiga punctul dupa expirarea timpului.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5 w-full max-w-6xl">
        <section className="lg:col-span-2 bg-[#202944] rounded-3xl p-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-gray-300 text-sm">Jucator</p>
              <p className="text-xl font-bold">{playerName}</p>
            </div>

            <div className="text-center">
              <p className="text-gray-300 text-sm">Intrebarea</p>

              <p className="text-3xl font-bold">
                {(gameState.current_question_index || 0) + 1}
              </p>
            </div>

            <div className="text-right">
              <p className="text-gray-300 text-sm">Timp ramas</p>

              <p className="text-3xl font-bold text-red-400">
                {gameState.time_left}s
              </p>
            </div>
          </div>

          <div className="bg-[#3a455f] rounded-2xl p-6 mt-5 min-h-[110px] flex items-center justify-center">
            <h2 className="text-2xl text-center font-bold leading-snug">
              {currentQuestion?.question}
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-5">
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
                className={`p-5 rounded-2xl text-xl font-bold transition-all min-h-[70px] ${
                  selectedAnswer === answer
                    ? "bg-yellow-500 text-black"
                    : answerSent || gameState.show_result
                    ? "bg-gray-500 text-white"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {answer}
              </button>
            ))}
          </div>

          {answerSent && !gameState.show_result && (
            <div className="bg-[#00071f] mt-5 p-5 rounded-2xl text-center">
              <p className="text-yellow-400 text-2xl font-bold">
                Raspuns trimis. Asteapta finalul timpului.
              </p>
            </div>
          )}

          {gameState.show_result && (
            <div className="bg-[#052e16] mt-5 p-5 rounded-2xl text-center">
              <p className="text-green-400 text-2xl font-bold">
                Raspuns corect: {gameState.last_correct_answer}
              </p>

              <p className="text-green-300 text-xl font-bold mt-2">
                {gameState.last_winner_name === "Nimeni"
                  ? "Nimeni nu a raspuns corect la aceasta intrebare."
                  : `${gameState.last_winner_name} a raspuns primul corect la aceasta intrebare.`}
              </p>
            </div>
          )}
        </section>

        <aside className="bg-[#202944] rounded-3xl p-5 max-h-[75vh] overflow-auto">
          <h2 className="text-2xl font-bold mb-4 text-center">
            Clasament LIVE
          </h2>

          <div className="flex flex-col gap-3">
            {players.map((player, index) => (
              <div
                key={player.id}
                className="bg-[#3a455f] rounded-2xl p-4 flex justify-between items-center"
              >
                <div className="text-base font-bold">
                  #{index + 1} - {player.name}
                </div>

                <div className="text-base text-yellow-400 font-bold">
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