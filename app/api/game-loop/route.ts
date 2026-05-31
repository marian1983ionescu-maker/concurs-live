/* AICI INCEPE CODUL - app/api/game-loop/route.ts */

import { NextResponse } from "next/server";
import { supabase } from "../../supabase";

const QUESTION_SECONDS = 15;
const RESULT_SECONDS = 3;
const POINTS_TO_WIN = 10;
const RECENT_LIMIT = 50;

let lastTick = 0;

export async function GET() {
  const now = Date.now();

  if (now - lastTick < 900) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  lastTick = now;

  const { data: game } = await supabase
    .from("game_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (!game) {
    return NextResponse.json({ ok: false, error: "Game state not found" });
  }

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

    return NextResponse.json({ ok: true, action: "game_started" });
  }

  if (!game.is_running || game.winner_name || game.show_result) {
    return NextResponse.json({ ok: true, action: "nothing_to_do" });
  }

  if (game.time_left > 0) {
    await supabase
      .from("game_state")
      .update({
        time_left: game.time_left - 1,
      })
      .eq("id", 1);

    return NextResponse.json({ ok: true, action: "tick" });
  }

  const questionOrder = game.question_order || [];
  const currentQuestionId = questionOrder[game.current_question_index];

  if (!currentQuestionId) {
    return NextResponse.json({ ok: false, error: "No current question" });
  }

  const { data: currentQuestion } = await supabase
    .from("questions")
    .select("*")
    .eq("id", currentQuestionId)
    .single();

  if (!currentQuestion) {
    return NextResponse.json({ ok: false, error: "Question not found" });
  }

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

        return NextResponse.json({ ok: true, action: "winner_found" });
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
  }, RESULT_SECONDS * 1000);

  return NextResponse.json({ ok: true, action: "result_processed" });
}

/* AICI SE TERMINA CODUL - app/api/game-loop/route.ts */