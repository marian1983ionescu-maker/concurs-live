/* AICI INCEPE CODUL - app/api/game-loop/route.ts */

import { NextResponse } from "next/server";
import { supabase } from "../../supabase";

const QUESTION_SECONDS = 15;
const RESULT_SECONDS = 3;
const WIN_SCORE = 30;

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
        error: String(lockError.message || lockError),
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
        error: String(gameStateError?.message || gameStateError),
      });
    }

    if (gameState.winner_name) {
      return NextResponse.json({
        success: true,
        step: "already_finished",
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

      return NextResponse.json({
        success: true,
        step: "waiting_or_started",
      });
    }

    if (!gameState.is_running) {
      return NextResponse.json({
        success: true,
        step: "not_running",
      });
    }

    const currentIndex = Number(gameState.current_question_index || 0);
    const questionOrder = Array.isArray(gameState.question_order)
      ? gameState.question_order
      : [];

    const currentQuestionId = questionOrder[currentIndex];

    if (!currentQuestionId) {
      return NextResponse.json({
        success: false,
        step: "missing_question_id",
      });
    }

    if (!gameState.show_result && Number(gameState.time_left || 0) > 0) {
      await supabase
        .from("game_state")
        .update({
          time_left: Number(gameState.time_left || 0) - 1,
        })
        .eq("id", 1);

      return NextResponse.json({
        success: true,
        step: "question_tick",
      });
    }

    if (!gameState.show_result) {
      const { data: scoringResult, error: scoringError } = await supabase.rpc(
        "process_current_question_and_score",
        {
          p_win_score: WIN_SCORE,
          p_result_seconds: RESULT_SECONDS,
        }
      );

      if (scoringError) {
        console.log("SCORING ERROR:", scoringError);

        return NextResponse.json({
          success: false,
          step: "scoring_error",
          error: String(scoringError.message || scoringError),
        });
      }

      return NextResponse.json({
        success: true,
        step: "scoring_done",
        result: scoringResult,
      });
    }

    if (gameState.show_result && Number(gameState.time_left || 0) > 0) {
      await supabase
        .from("game_state")
        .update({
          time_left: Number(gameState.time_left || 0) - 1,
        })
        .eq("id", 1);

      return NextResponse.json({
        success: true,
        step: "result_tick",
      });
    }

    const nextIndex = currentIndex + 1;

    if (nextIndex >= questionOrder.length) {
      const now = new Date().toISOString();

      const { data: bestPlayer, error: bestPlayerError } = await supabase
        .from("players")
        .select("*")
        .order("score", { ascending: false })
        .limit(1);

      if (bestPlayerError) {
        console.log("BEST PLAYER ERROR:", bestPlayerError);

        return NextResponse.json({
          success: false,
          step: "best_player_error",
          error: String(bestPlayerError.message || bestPlayerError),
        });
      }

      if (bestPlayer && bestPlayer.length > 0) {
        await supabase
          .from("game_state")
          .update({
            is_running: false,
            winner_name: bestPlayer[0].name,
            final_winner_score: Number(bestPlayer[0].score || 0),
            finished_at: now,
            show_result: false,
            time_left: 0,
            updated_at: now,
          })
          .eq("id", 1);

        await supabase.from("winners").insert([
          {
            player_name: bestPlayer[0].name,
            prize: "MENIUL ZILEI",
          },
        ]);
      }

      return NextResponse.json({
        success: true,
        step: "finished_no_more_questions",
      });
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

    return NextResponse.json({
      success: true,
      step: "next_question",
    });
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