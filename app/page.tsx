/* AICI INCEPE CODUL - app/page.tsx */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  session_id: string | null;
  is_active: boolean;
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
  reset_key: string | null;
  finished_at: string | null;
  final_winner_score: number | null;
};

export default function Home() {
  const [questionsMap, setQuestionsMap] = useState<Record<string, Question>>({});
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);

  const [playerName, setPlayerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [answerSent, setAnswerSent] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const tickSoundRef = useRef<HTMLAudioElement | null>(null);
  const correctSoundRef = useRef<HTMLAudioElement | null>(null);
  const winnerSoundRef = useRef<HTMLAudioElement | null>(null);
  const timeoutSoundRef = useRef<HTMLAudioElement | null>(null);

  const lastTickSecondRef = useRef<number | null>(null);
  const lastResultKeyRef = useRef<string | null>(null);
  const lastWinnerSoundRef = useRef<string | null>(null);

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
    tickSoundRef.current = new Audio("/sounds/tick.mp3");
    correctSoundRef.current = new Audio("/sounds/correct.mp3");
    winnerSoundRef.current = new Audio("/sounds/winner.mp3");
    timeoutSoundRef.current = new Audio("/sounds/timeout.mp3");

    restoreSavedPlayer();

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
    if (!gameState?.is_running) return;

    const gameLoop = setInterval(async () => {
      try {
        await fetch("/api/game-loop");
      } catch (error) {
        console.log("EROARE GAME LOOP:", error);
      }
    }, 1000);

    return () => clearInterval(gameLoop);
  }, [gameState?.is_running]);

  useEffect(() => {
    if (!gameState?.reset_key) return;

    const savedResetKey = localStorage.getItem("concurs_reset_key");

    if (savedResetKey && savedResetKey !== gameState.reset_key) {
      logoutLocalPlayer(gameState.reset_key);
      return;
    }

    if (!savedResetKey) {
      localStorage.setItem("concurs_reset_key", gameState.reset_key);
    }
  }, [gameState?.reset_key]);

  useEffect(() => {
    if (currentQuestionId && !questionsMap[currentQuestionId]) {
      loadSingleQuestion(currentQuestionId);
    }
  }, [currentQuestionId, questionsMap]);

  useEffect(() => {
    checkExistingAnswer();
  }, [
    gameState?.current_question_index,
    gameState?.updated_at,
    phone,
    currentQuestionId,
    currentQuestion?.id,
  ]);

  useEffect(() => {
    if (!gameState?.is_running || gameState.show_result) return;

    if (gameState.time_left <= 3 && gameState.time_left > 0) {
      if (lastTickSecondRef.current !== gameState.time_left) {
        lastTickSecondRef.current = gameState.time_left;
        playSound(tickSoundRef);
      }
    }

    if (gameState.time_left > 3) {
      lastTickSecondRef.current = null;
    }
  }, [gameState?.time_left, gameState?.is_running, gameState?.show_result]);

  useEffect(() => {
    if (!gameState?.show_result) return;

    const resultKey = `${gameState.current_question_index}-${gameState.last_correct_answer}-${gameState.last_winner_name}`;

    if (lastResultKeyRef.current === resultKey) return;

    lastResultKeyRef.current = resultKey;

    if (gameState.last_winner_name && gameState.last_winner_name !== "Nimeni") {
      playSound(correctSoundRef);
    } else {
      playSound(timeoutSoundRef);
    }
  }, [
    gameState?.show_result,
    gameState?.current_question_index,
    gameState?.last_correct_answer,
    gameState?.last_winner_name,
  ]);

  useEffect(() => {
    if (!gameState?.winner_name) return;

    if (lastWinnerSoundRef.current === gameState.winner_name) return;

    lastWinnerSoundRef.current = gameState.winner_name;
    playSound(winnerSoundRef);
  }, [gameState?.winner_name]);

  function playSound(soundRef: { current: HTMLAudioElement | null }) {
    if (!soundEnabled) return;

    const sound = soundRef.current;

    if (!sound) return;

    sound.currentTime = 0;
    sound.volume = 1;
    sound.play().catch(() => {});
  }

  function unlockSounds() {
    const sounds = [
      tickSoundRef.current,
      correctSoundRef.current,
      winnerSoundRef.current,
      timeoutSoundRef.current,
    ];

    sounds.forEach((sound) => {
      if (!sound) return;

      sound.volume = 0.01;
      sound.currentTime = 0;

      sound
        .play()
        .then(() => {
          sound.pause();
          sound.currentTime = 0;
          sound.volume = 1;
        })
        .catch(() => {
          sound.volume = 1;
        });
    });
  }

  async function enableSound() {
    unlockSounds();
    setSoundEnabled(true);
  }

  function SoundButton() {
    return !soundEnabled ? (
      <button
        onClick={enableSound}
        className="mb-4 bg-green-500 hover:bg-green-400 text-black font-black px-6 py-3 rounded-2xl shadow-lg"
      >
        ACTIVEAZA SUNET
      </button>
    ) : (
      <div className="mb-4 bg-green-500 text-black font-black px-6 py-3 rounded-2xl">
        SUNET ACTIV
      </div>
    );
  }

  function getNextSundayAt20() {
    const now = new Date();
    const nextSunday = new Date(now);
    const day = now.getDay();
    const daysUntilSunday = day === 0 ? 7 : 7 - day;

    nextSunday.setDate(now.getDate() + daysUntilSunday);
    nextSunday.setHours(20, 0, 0, 0);

    return nextSunday;
  }

  function formatDateRo(date: Date) {
    return `${String(date.getDate()).padStart(2, "0")}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}-${date.getFullYear()}`;
  }

  function formatCountdown(totalSeconds: number) {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `${days} zile ${hours} ore ${minutes} minute ${seconds} secunde`;
    }

    if (hours > 0) {
      return `${hours} ore ${minutes} minute ${seconds} secunde`;
    }

    return `${minutes} minute ${seconds} secunde`;
  }

  function getOrCreateSessionId() {
    let sessionId = localStorage.getItem("concurs_session_id");

    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem("concurs_session_id", sessionId);
    }

    return sessionId;
  }

  function logoutLocalPlayer(newResetKey?: string) {
    localStorage.removeItem("concurs_player");
    localStorage.removeItem("concurs_session_id");

    if (newResetKey) {
      localStorage.setItem("concurs_reset_key", newResetKey);
    }

    setPlayerName("");
    setPhone("");
    setEmail("");
    setJoined(false);
    setSelectedAnswer("");
    setAnswerSent(false);
  }

  function restoreSavedPlayer() {
    const savedPlayer = localStorage.getItem("concurs_player");

    if (!savedPlayer) return;

    try {
      const player = JSON.parse(savedPlayer);

      const savedName = String(player.name || "").trim();
      const savedPhone = String(player.phone || "").replace(/\s+/g, "");
      const savedEmail = String(player.email || "").trim().toLowerCase();

      const phoneRegex = /^07[0-9]{8}$/;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

      if (!savedName || !phoneRegex.test(savedPhone) || !emailRegex.test(savedEmail)) {
        logoutLocalPlayer();
        return;
      }

      setPlayerName(savedName);
      setPhone(savedPhone);
      setEmail(savedEmail);
      setJoined(true);
    } catch {
      logoutLocalPlayer();
    }
  }

  function getSavedPlayerData() {
    const savedPlayer = localStorage.getItem("concurs_player");

    if (!savedPlayer) {
      return {
        name: playerName.trim(),
        phone: phone.replace(/\s+/g, ""),
        email: email.trim().toLowerCase(),
      };
    }

    try {
      const player = JSON.parse(savedPlayer);

      return {
        name: String(player.name || playerName || "").trim(),
        phone: String(player.phone || phone || "").replace(/\s+/g, ""),
        email: String(player.email || email || "").trim().toLowerCase(),
      };
    } catch {
      return {
        name: playerName.trim(),
        phone: phone.replace(/\s+/g, ""),
        email: email.trim().toLowerCase(),
      };
    }
  }

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

  async function loadSingleQuestion(questionId: string) {
    const { data } = await supabase
      .from("public_questions")
      .select("*")
      .eq("id", questionId)
      .single();

    if (data) {
      setQuestionsMap((oldMap) => ({
        ...oldMap,
        [data.id]: data,
      }));
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
    const saved = getSavedPlayerData();

    if (!saved.phone || !currentQuestion || !gameState?.updated_at) return;

    const { data } = await supabase
      .from("answers")
      .select("*")
      .eq("phone", saved.phone)
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
    unlockSounds();

    const phoneClean = phone.replace(/\s+/g, "");
    const emailClean = email.trim().toLowerCase();
    const nameClean = playerName.trim();
    const sessionId = getOrCreateSessionId();

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

    const { data: existingPlayers } = await supabase
      .from("players")
      .select("*")
      .or(`phone.eq.${phoneClean},email.eq.${emailClean}`)
      .limit(1);

    const existingPlayer = existingPlayers?.[0];

    if (existingPlayer) {
      if (
        existingPlayer.is_active &&
        existingPlayer.session_id &&
        existingPlayer.session_id !== sessionId
      ) {
        alert("Acest cont este deja activ pe alt dispozitiv.");
        return;
      }

      const { error } = await supabase
        .from("players")
        .update({
          name: nameClean,
          phone: phoneClean,
          email: emailClean,
          ip: userIp,
          session_id: sessionId,
          is_active: true,
        })
        .eq("id", existingPlayer.id);

      if (error) {
        alert("Eroare la activarea contului.");
        return;
      }
    } else {
      const { error } = await supabase.from("players").insert([
        {
          name: nameClean,
          phone: phoneClean,
          email: emailClean,
          ip: userIp,
          session_id: sessionId,
          is_active: true,
          score: 0,
        },
      ]);

      if (error) {
        alert("Eroare la crearea contului.");
        return;
      }
    }

    localStorage.setItem(
      "concurs_player",
      JSON.stringify({
        name: nameClean,
        phone: phoneClean,
        email: emailClean,
      })
    );

    if (gameState?.reset_key) {
      localStorage.setItem("concurs_reset_key", gameState.reset_key);
    }

    setPlayerName(nameClean);
    setPhone(phoneClean);
    setEmail(emailClean);
    setJoined(true);

    await loadPlayers();
  }

  async function handleAnswer(answer: string) {
    const saved = getSavedPlayerData();

    if (
      !currentQuestion ||
      !gameState?.is_running ||
      gameState.show_result ||
      answerSent ||
      gameState.time_left <= 0
    ) {
      return;
    }

    if (!saved.name || !saved.phone || !saved.email) {
      logoutLocalPlayer();
      return;
    }

    setSelectedAnswer(answer);
    setAnswerSent(true);

    await supabase.from("answers").insert([
      {
        player_name: saved.name,
        phone: saved.phone,
        email: saved.email,
        question_id: currentQuestion.id,
        answer,
        is_correct: false,
      },
    ]);
  }

  if (!joined) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#020617] via-[#07153a] to-[#020617] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-[#101b3b]/90 backdrop-blur-xl border border-blue-500/20 rounded-[28px] p-6 shadow-[0_0_70px_rgba(37,99,235,0.25)]">
          <div className="flex justify-center mb-4">
            <Image src="/logo.jpg" alt="logo" width={140} height={140} className="rounded-2xl" />
          </div>

          <h1 className="text-white text-2xl font-black text-center leading-tight">
            Concurs LIVE
          </h1>

          <p className="text-blue-300 text-center mt-2 text-base">
            Suruburi-Holsuruburi.RO
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <SoundButton />

            <input className="bg-[#1b2952] border border-blue-400/20 text-white p-3 rounded-2xl text-base outline-none focus:border-blue-400" placeholder="Nume complet" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
            <input className="bg-[#1b2952] border border-blue-400/20 text-white p-3 rounded-2xl text-base outline-none focus:border-blue-400" placeholder="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input className="bg-[#1b2952] border border-blue-400/20 text-white p-3 rounded-2xl text-base outline-none focus:border-blue-400" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />

            <button onClick={joinGame} className="bg-gradient-to-r from-blue-600 to-blue-500 hover:scale-[1.02] transition-all text-white p-3 rounded-2xl text-lg font-black shadow-lg shadow-blue-600/30">
              INTRA IN JOC
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!gameState || Object.keys(questionsMap).length === 0) {
    return (
      <main className="min-h-screen bg-[#020617] flex items-center justify-center text-white text-2xl font-bold">
        Se incarca jocul...
      </main>
    );
  }

  if (gameState.winner_name) {
    const finishedAt = gameState.finished_at
      ? new Date(gameState.finished_at).getTime()
      : Date.now();

    const secondsSinceFinish = Math.floor((nowMs - finishedAt) / 1000);
    const nextGameDate = getNextSundayAt20();
    const secondsToNextGame = Math.max(
      0,
      Math.ceil((nextGameDate.getTime() - nowMs) / 1000)
    );

    return (
      <main className="min-h-screen bg-gradient-to-br from-[#020617] via-[#07153a] to-[#020617] flex items-center justify-center p-4 text-white">
        <div className="bg-[#101b3b]/90 border border-green-400/30 shadow-[0_0_100px_rgba(34,197,94,0.35)] rounded-[35px] p-8 text-center max-w-2xl">
          <SoundButton />

          <div className="flex justify-center mb-5">
            <Image src="/logo.jpg" alt="logo" width={130} height={130} className="rounded-2xl" />
          </div>

          {secondsSinceFinish < 60 ? (
            <>
              <h1 className="text-4xl font-black text-green-400 leading-tight">
                Jocul s-a terminat
              </h1>

              <p className="text-2xl mt-5 font-bold text-white leading-snug">
                {gameState.winner_name} a raspuns primul corect la{" "}
                {gameState.final_winner_score || 10} intrebari si a castigat 100 de lei.
              </p>

              <p className="text-xl mt-6 text-blue-200 leading-snug">
                Urmatorul joc este programat sa inceapa Duminica viitoare{" "}
                ({formatDateRo(nextGameDate)}) la ora 20:00.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-4xl font-black text-blue-300 leading-tight">
                Jocul porneste in:
              </h1>

              <div className="bg-[#020617] rounded-[30px] p-6 mt-6 mb-5 border border-green-400/20 shadow-[0_0_70px_rgba(34,197,94,0.2)]">
                <p className="text-4xl font-black text-green-400 leading-relaxed">
                  {formatCountdown(secondsToNextGame)}
                </p>
              </div>

              <p className="text-xl text-blue-200">
                Duminica viitoare ({formatDateRo(nextGameDate)}) la ora 20:00.
              </p>
            </>
          )}
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
        <div className="bg-[#101b3b]/90 border border-blue-400/20 shadow-[0_0_80px_rgba(37,99,235,0.25)] rounded-[35px] p-8 text-center max-w-2xl">
          <SoundButton />

          <div className="flex justify-center mb-5">
            <Image src="/logo.jpg" alt="logo" width={130} height={130} className="rounded-2xl" />
          </div>

          <h1 className="text-4xl font-black text-blue-300 mb-5">
            Lobby LIVE
          </h1>

          <p className="text-xl mb-5">Concursul incepe in:</p>

          <div className="bg-[#020617] rounded-[30px] p-6 mb-5 border border-green-400/20 shadow-[0_0_70px_rgba(34,197,94,0.2)]">
            <p className="text-4xl font-black text-green-400 leading-relaxed">
              {formatCountdown(countdownToGame)}
            </p>
          </div>

          <p className="text-lg text-blue-100">
            Ramai pe pagina. Jocul porneste automat.
          </p>
        </div>
      </main>
    );
  }

  if (!gameState.is_running && !gameState.game_start) {
    const nextGameDate = getNextSundayAt20();
    const secondsToNextGame = Math.max(
      0,
      Math.ceil((nextGameDate.getTime() - nowMs) / 1000)
    );

    return (
      <main className="min-h-screen bg-gradient-to-br from-[#020617] via-[#07153a] to-[#020617] flex items-center justify-center p-4 text-white">
        <div className="bg-[#101b3b]/90 border border-blue-400/20 shadow-[0_0_80px_rgba(37,99,235,0.25)] rounded-[35px] p-8 text-center max-w-2xl">
          <SoundButton />

          <div className="flex justify-center mb-5">
            <Image src="/logo.jpg" alt="logo" width={130} height={130} className="rounded-2xl" />
          </div>

          <h1 className="text-4xl font-black text-blue-300 leading-tight">
            Concursul nu este pornit momentan
          </h1>

          <p className="text-xl mt-5 text-blue-100 leading-snug">
            Urmatorul joc este programat Duminica viitoare{" "}
            ({formatDateRo(nextGameDate)}) la ora 20:00.
          </p>

          <div className="bg-[#020617] rounded-[30px] p-6 mt-6 border border-green-400/20 shadow-[0_0_70px_rgba(34,197,94,0.2)]">
            <p className="text-2xl font-black text-green-300 mb-3">
              Jocul porneste in:
            </p>

            <p className="text-4xl font-black text-green-400 leading-relaxed">
              {formatCountdown(secondsToNextGame)}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#020617] via-[#07153a] to-[#020617] text-white px-4 py-2 flex flex-col items-center overflow-hidden">
      <div className="flex flex-col items-center">
        <SoundButton />

        <Image src="/logo.jpg" alt="logo" width={78} height={78} className="rounded-xl shadow-[0_0_35px_rgba(37,99,235,0.35)]" />

        <h1 className="text-3xl md:text-4xl font-black text-center mt-2">
          Concurs LIVE
        </h1>

        <p className="text-blue-300 text-sm mt-1 text-center">
          Suruburi-Holsuruburi.RO
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4 w-full max-w-6xl">
        <section className="lg:col-span-2 bg-[#101b3b]/90 border border-blue-400/20 rounded-[28px] p-4 shadow-[0_0_55px_rgba(37,99,235,0.15)]">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <div className="bg-[#1b2952] px-4 py-2 rounded-2xl">
              <p className="text-xs text-blue-200">Jucator</p>
              <p className="text-lg font-black">{playerName}</p>
            </div>

            <div className="bg-[#1b2952] px-4 py-2 rounded-2xl text-center">
              <p className="text-xs text-blue-200">Intrebarea</p>
              <p className="text-2xl font-black">
                {(gameState.current_question_index || 0) + 1}
              </p>
            </div>

            <div className="bg-[#220f17] px-4 py-2 rounded-2xl text-center border border-red-400/20">
              <p className="text-xs text-red-200">Timp ramas</p>
              <p className="text-2xl font-black text-red-400">
                {gameState.time_left}s
              </p>
            </div>
          </div>

          <div className="bg-[#1b2952] border border-blue-400/10 rounded-[24px] p-5 mt-4 min-h-[105px] flex items-center justify-center">
            <h2 className="text-xl md:text-2xl text-center font-black leading-snug">
              {currentQuestion?.question || "Se incarca intrebarea..."}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            {[
              currentQuestion?.answer_1,
              currentQuestion?.answer_2,
              currentQuestion?.answer_3,
              currentQuestion?.answer_4,
            ].map((answer, index) => (
              <button
                key={`${answer || "raspuns"}-${index}`}
                onClick={() => answer && handleAnswer(answer)}
                disabled={!answer || answerSent || gameState.show_result}
                className={`p-4 rounded-[20px] text-lg font-black transition-all min-h-[65px] border ${
                  selectedAnswer === answer
                    ? "bg-yellow-400 text-black border-yellow-200 scale-[1.02]"
                    : !answer || answerSent || gameState.show_result
                    ? "bg-gray-600 text-white border-gray-500"
                    : "bg-blue-600 hover:bg-blue-500 hover:scale-[1.02] border-blue-400/20"
                }`}
              >
                {answer || ""}
              </button>
            ))}
          </div>

          {answerSent && !gameState.show_result && (
            <div className="bg-[#02122e] border border-yellow-400/20 mt-4 p-4 rounded-[20px] text-center">
              <p className="text-yellow-300 text-xl font-black">
                Raspuns trimis!
              </p>
            </div>
          )}

          {gameState.show_result && (
            <div className="bg-[#052e16] border border-green-400/20 mt-4 p-4 rounded-[20px] text-center">
              <p className="text-green-300 text-xl font-black">
                Raspuns corect:
              </p>

              <p className="text-white text-2xl font-black mt-1">
                {gameState.last_correct_answer}
              </p>

              <p className="text-green-200 text-lg font-bold mt-2">
                {gameState.last_winner_name === "Nimeni"
                  ? "Nimeni nu a raspuns corect."
                  : `${gameState.last_winner_name} a raspuns primul corect.`}
              </p>
            </div>
          )}
        </section>

        <aside className="bg-[#101b3b]/90 border border-blue-400/20 rounded-[28px] p-4 max-h-[70vh] overflow-auto shadow-[0_0_55px_rgba(37,99,235,0.15)]">
          <h2 className="text-2xl font-black mb-4 text-center text-blue-300">
            Clasament LIVE
          </h2>

          <div className="flex flex-col gap-3">
            {players
              .filter((player) => player.is_active)
              .map((player, index) => (
                <div
                  key={player.id}
                  className={`rounded-[20px] p-3 flex justify-between items-center border ${
                    index === 0
                      ? "bg-gradient-to-r from-yellow-500 to-yellow-400 text-black border-yellow-200"
                      : "bg-[#1b2952] border-blue-400/10"
                  }`}
                >
                  <div className="text-sm font-black">
                    #{index + 1} - {player.name}
                  </div>

                  <div className="text-sm font-black">
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