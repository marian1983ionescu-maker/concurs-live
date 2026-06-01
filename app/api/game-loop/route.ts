/* AICI INCEPE CODUL - app/api/game-loop/route.ts */

import { NextResponse } from "next/server";
import { supabase } from "../../supabase";

const QUESTION_SECONDS = 15;
const RESULT_SECONDS = 3;
const WIN_SCORE = 10;

function clean(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cleanPhone(value: unknown) {
  return String(value || "").replace(/\s+/g, "").trim();
}

async function findPlayer(winner: any) {
  const phone = cleanPhone(winner.phone);
  const email = clean(winner.email);
  const name = String(winner.player_name || "").trim();

  if (phone) {
    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("phone", phone)
      .limit(1);

    if (data && data.length > 0) return data[0];
  }

  if (email) {
    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("email", email)
      .limit(1);

    if (data && data.length > 0) return data[0];
  }

  if (name) {
    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("name", name)
      .limit(1);

    if (data && data.length > 0) return data[0];
  }

  return null;
}

async function finishGame(player: any) {
  const now = new Date().toISOString();

  await supabase
    .from("game_state")
    .update({
      is_running: false,
      winner_name: player.name,
      final_winner_score: Number(player.score || 0),
      finished_at: now,
      show_result: false,
      time_left: 0,
      updated_at: now,
    })
    .eq("id", 1);

  await supabase.from("winners").insert([
    {
      player_name: player.name,
      prize: "100 LEI",
    },
  ]);
}

export async function GET() {
  try {
    const { data: lockOk, error: lockError } = await supabase.rpc(
      "acquire_game_loop_lock"
    );

    if (lockError) {
      console.log("LOCK ERROR:", lockError);

      return NextResponse.json({
        success: false,
        step: "lock_error",
        error: lockError,
      });
    }

    if (!lockOk) {
      return NextResponse.json({
        success: true,
        locked: true,
      });
    }

    const { data: gameState, error: gameStateError } = await supabase
      .from("game_state")
      .select("*")
      .eq("id", 1)
      .single();

    if (gameStateError || !gameState) {
      console.log("GAME STATE ERROR:", gameStateError);

      return NextResponse.json({
        success: false,
        step: "game_state",
        error: gameStateError,
      });
    }

    if (!gameState.is_running && gameState.game_start) {
      const now = Date.now();
      const gameStart = new Date(gameState.game_start).getTime();

      if (now >= gameStart) {
        await supabase
          .from("game_state")
          .update({
            is_running: true,
            time_left: QUESTION_SECONDS,
            show_result: false,
            winner_name: null,
            finished_at: null,
            final_winner_score: 0,
            updated_at: new Date().toISOString(),
          })
          .eq("id", 1);
      }

      return NextResponse.json({ success: true });
    }

    if (!gameState.is_running) {
      return NextResponse.json({ success: true });
    }

    const { data: winnerAlready } = await supabase
      .from("players")
      .select("*")
      .gte("score", WIN_SCORE)
      .order("score", { ascending: false })
      .limit(1);

    if (winnerAlready && winnerAlready.length > 0) {
      await finishGame(winnerAlready[0]);

      return NextResponse.json({ success: true });
    }

    const currentIndex = gameState.current_question_index || 0;
    const questionOrder = gameState.question_order || [];
    const currentQuestionId = questionOrder[currentIndex];

    if (!currentQuestionId) {
      return NextResponse.json({
        success: false,
        step: "missing_question_id",
      });
    }

    if (!gameState.show_result && gameState.time_left > 0) {
      await supabase
        .from("game_state")
        .update({
          time_left: gameState.time_left - 1,
        })
        .eq("id", 1);

      return NextResponse.json({ success: true });
    }

    if (!gameState.show_result) {
      const { data: publicQuestion } = await supabase
        .from("public_questions")
        .select("*")
        .eq("id", currentQuestionId)
        .single();

      if (!publicQuestion) {
        return NextResponse.json({
          success: false,
          step: "public_question_missing",
        });
      }

      const { data: privateQuestion } = await supabase
        .from("questions")
        .select("*")
        .eq("question", publicQuestion.question)
        .single();

      if (!privateQuestion) {
        return NextResponse.json({
          success: false,
          step: "private_question_missing",
        });
      }

      const correctAnswer = privateQuestion.correct_answer;

      const { data: answers } = await supabase
        .from("answers")
        .select("*")
        .eq("question_id", currentQuestionId)
        .eq("is_correct", false)
        .order("answered_at", { ascending: true });

      let winnerName = "Nimeni";

      const winner = answers?.find(
        (item) => clean(item.answer) === clean(correctAnswer)
      );

      if (winner) {
        winnerName = winner.player_name;

        const player = await findPlayer(winner);

        if (player) {
          const newScore = Number(player.score || 0) + 1;

          await supabase
            .from("players")
            .update({
              score: newScore,
            })
            .eq("id", player.id);

          await supabase
            .from("answers")
            .update({
              is_correct: true,
            })
            .eq("id", winner.id);

          if (newScore >= WIN_SCORE) {
            await finishGame({
              ...player,
              score: newScore,
            });

            return NextResponse.json({ success: true });
          }
        }
      }

      await supabase
        .from("game_state")
        .update({
          show_result: true,
          time_left: RESULT_SECONDS,
          last_winner_name: winnerName,
          last_correct_answer: correctAnswer,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      return NextResponse.json({ success: true });
    }

    if (gameState.show_result && gameState.time_left > 0) {
      await supabase
        .from("game_state")
        .update({
          time_left: gameState.time_left - 1,
        })
        .eq("id", 1);

      return NextResponse.json({ success: true });
    }

    const nextIndex = currentIndex + 1;

    if (nextIndex >= questionOrder.length) {
      const { data: bestPlayer } = await supabase
        .from("players")
        .select("*")
        .order("score", { ascending: false })
        .limit(1);

      if (bestPlayer && bestPlayer.length > 0) {
        await finishGame(bestPlayer[0]);
      }

      return NextResponse.json({ success: true });
    }

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("EROARE GAME LOOP:", error);

    return NextResponse.json(
      {
        success: false,
        step: "catch",
        error: String(error),
      },
      { status: 500 }
    );
  }
}

/* AICI SE TERMINA CODUL - app/api/game-loop/route.ts */