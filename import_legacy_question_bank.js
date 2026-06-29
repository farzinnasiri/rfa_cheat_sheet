#!/usr/bin/env node
// One-time importer from the old polished HTML + final score CSV into question_bank.json.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = __dirname;
const FINAL_SCORE_CSV = path.join(ROOT, "..", ".analysis_exam_text", "july_2026_final_question_scores.csv");
const OUTPUT = path.join(ROOT, "question_bank.json");

const files = [
  { file: "polished_measure_theory_questions.html", subject: "measure" },
  { file: "polished_functional_theory_questions.html", subject: "functional" }
];

const TOPIC_LABELS = {
  measurable_functions: "Measurability traps",
  integral_definitions: "Integral definitions",
  convergence_modes: "Convergence modes",
  convergence_theorems: "Convergence theorems",
  lebesgue_points_ftc: "Lebesgue points / FTC",
  ac_w11_bv: "AC / BV / W11",
  weak_weakstar: "Weak / weak-star",
  fredholm_spectral: "Fredholm / spectral",
  hahn_banach_dual: "Hahn-Banach / duality",
  open_inverse_closed_graph: "Open / inverse / closed graph",
  baire_ubp: "Baire / UBP",
  metric_topology: "Metric / separability",
  lp_ellp: "Lp / ellp",
  operator_basics: "Operator basics",
  compact_operator: "Compact operators",
  hilbert_projection_riesz: "Hilbert representation",
  reflexivity_uniform_convexity: "Reflexivity",
  normed_banach_basics: "Normed basics",
  outer_measure_caratheodory: "Caratheodory",
  measure_basics: "Measure basics",
  lebesgue_regular: "Lebesgue regularity",
  vanishing_lemma: "Vanishing lemma",
  cantor_vitali: "Cantor / Vitali",
  radon_nikodym: "Radon-Nikodym"
};

const TIER_STARS = {
  A: "★★★",
  B: "★★",
  C: "★",
  D: "Suppressed"
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const header = rows.shift();
  return rows.filter(r => r.length === header.length).map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

function cleanBankQuestionText(text) {
  return String(text || "")
    .replace(/\s*\d+\s*=+\s*PAGE\s+\d+\s*=+\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuestions(html, subject) {
  const questions = [];
  let currentChapter = "";
  let globalIndex = 0;
  const lines = html.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    const h2Match = line.match(/<h2[^>]*>(.*?)<\/h2>/);
    if (h2Match) {
      currentChapter = h2Match[1].trim();
      i++;
      continue;
    }

    const liStart = line.match(/^<li\s+data-proof="([^"]+)"/);
    if (liStart) {
      globalIndex++;
      let liContent = "";
      let depth = 0;
      while (i < lines.length) {
        const l = lines[i];
        liContent += l + "\n";
        if (l.includes("<li")) depth++;
        if (l.includes("</li>")) {
          depth--;
          if (depth <= 0) { i++; break; }
        }
        i++;
      }

      const isProof = liStart[1] === "true";
      const starsMatch = liContent.match(/(★+)/);
      const priority = starsMatch ? starsMatch[1] : "★";
      const bankRefMatch = liContent.match(/<span class="bank-ref"[^>]*>([^<]+)<\/span>/);
      const bankRef = bankRefMatch ? bankRefMatch[1].trim() : "";
      const bankRefTitle = liContent.match(/title="([^"]+)"/);
      const bankRefFull = bankRefTitle ? bankRefTitle[1].trim() : bankRef;
      const questionHtml = liContent
        .replace(/^[\s\S]*?<li[^>]*>/, "")
        .replace(/<details[\s\S]*$/, "")
        .replace(/<span class="bank-ref"[^>]*>[\s\S]*?<\/span>/g, "")
        .replace(/^[★\s]+/, "")
        .trim();
      const answerMatch = liContent.match(/<div class="answer-body">([\s\S]*?)<\/div>\s*<\/details>/);
      const answerHtml = answerMatch ? answerMatch[1].trim() : "";
      const strategyMatch = answerHtml.match(/<strong>Proof sketch \/ Polya view:<\/strong>([\s\S]*?)<em>Question focus:<\/em>/);
      const strategyHtml = strategyMatch ? strategyMatch[1].trim() : "";
      const formulaMatches = [...answerHtml.matchAll(/<div class="formula">([\s\S]*?)<\/div>/g)];
      const keyStepsHtml = formulaMatches
        .slice(0, 2)
        .map(m => `<div class="formula">${m[1]}</div>`)
        .join("");

      questions.push({
        id: `${subject}-${globalIndex}`,
        subject,
        chapter: currentChapter,
        priority,
        isProof,
        bankRef,
        bankRefFull,
        questionHtml,
        strategyHtml,
        keyStepsHtml,
        answerHtml
      });
      continue;
    }
    i++;
  }

  questions.forEach((q, index) => {
    q.id = `${subject}-${index + 1}`;
  });
  return questions;
}

function bankRefsOf(q) {
  return (q.bankRef || "").match(/Q[12]\.\d+/g) || [];
}

function tierKey(tier) {
  return (tier || "D").charAt(0);
}

function toScoreRow(row) {
  return {
    rank: Number(row.rank),
    qid: row.qid,
    score: Number(row.score),
    tier: row.tier,
    subject: row.subject,
    topic: row.topic,
    family: row.family,
    familyProbability: Number(row.family_probability),
    topicProbability: Number(row.topic_probability),
    seen2026Exact: row.seen_2026_exact === "yes",
    exactUses: Number(row.exact_uses_2023_2026),
    julyExactUses: Number(row.july_exact_uses_2023_2025),
    reason: row.reason,
    question: cleanBankQuestionText(row.question)
  };
}

function main() {
  const finalScores = parseCsv(fs.readFileSync(FINAL_SCORE_CSV, "utf8")).map(toScoreRow);
  const scoreByRef = new Map(finalScores.map(row => [row.qid, row]));
  const questions = [];

  for (const { file, subject } of files) {
    questions.push(...extractQuestions(fs.readFileSync(path.join(ROOT, file), "utf8"), subject));
  }

  const represented = new Set();
  for (const q of questions) {
    for (const ref of bankRefsOf(q)) represented.add(ref);
  }

  for (const row of finalScores) {
    const tier = tierKey(row.tier);
    if (tier === "D" || represented.has(row.qid)) continue;

    const subject = row.subject === "real" ? "measure" : "functional";
    const chapter = row.family || (subject === "measure" ? "Real Analysis" : "Functional Analysis");
    questions.push({
      id: `bank-score-${row.qid.toLowerCase().replace(".", "-")}`,
      subject,
      chapter,
      priority: TIER_STARS[tier] || "★",
      isProof: /proof|prove|show|justify/i.test(row.question),
      bankRef: row.qid,
      bankRefFull: `Theory Questions.pdf: ${row.qid}`,
      questionHtml: row.question,
      strategyHtml: "",
      keyStepsHtml: "",
      answerHtml: `<p><strong>Official-bank score card.</strong> This item is important enough for July preparation but does not yet have a polished answer in the trainer.</p><p><strong>Score:</strong> ${row.score} · <strong>Tier:</strong> ${row.tier} · <strong>Cluster:</strong> ${TOPIC_LABELS[row.topic] || row.topic}.</p><p><strong>Why it is here:</strong> ${row.reason}.</p>`
    });
    represented.add(row.qid);
  }

  questions.forEach(q => {
    const scores = bankRefsOf(q).map(ref => scoreByRef.get(ref)).filter(Boolean);
    const best = scores.sort((a, b) => b.score - a.score)[0];
    if (!best) return;
    q.finalTier = tierKey(best.tier);
    q.finalScore = best.score;
    q.finalRank = best.rank;
    q.finalTopic = best.topic;
    q.finalTopicLabel = TOPIC_LABELS[best.topic] || best.topic;
    q.finalReason = best.reason;
    q.finalSeen2026 = best.seen2026Exact;
    q.finalFamily = best.family;
    q.finalTopicProbability = best.topicProbability;
    q.priority = TIER_STARS[q.finalTier] || q.priority;
  });

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify({
      meta: {
        sourceVersion: 1,
        sourceNote: "Canonical source for all website question text, solutions, score metadata, and generated browser assets."
      },
      finalScores,
      questions
    }, null, 2) + "\n",
    "utf8"
  );

  console.log(`Wrote ${path.relative(ROOT, OUTPUT)} with ${questions.length} questions and ${finalScores.length} score rows`);
}

main();
