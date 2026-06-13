#!/usr/bin/env node
// extract_questions.js  — run with: node extract_questions.js

const fs = require("fs");
const path = require("path");

const files = [
  { file: "polished_measure_theory_questions.html", subject: "measure" },
  { file: "polished_functional_theory_questions.html", subject: "functional" }
];

// Minimal HTML parser using regex — good enough for our well-structured files
function extractQuestions(html, subject) {
  const questions = [];
  let currentChapter = "";
  let globalIndex = 0;

  // Split into lines for sequential processing
  const lines = html.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Detect chapter headings: <h2>N. Chapter Title</h2>
    const h2Match = line.match(/<h2[^>]*>(.*?)<\/h2>/);
    if (h2Match) {
      currentChapter = h2Match[1].trim();
      i++;
      continue;
    }

    // Detect list items: <li data-proof="...">★★ Question text <span class="bank-ref"...>QX.XX</span>
    const liStart = line.match(/^<li\s+data-proof="([^"]+)"/);
    if (liStart) {
      globalIndex++;

      // Collect all lines of this <li> until </li>
      let liContent = "";
      let depth = 0;
      while (i < lines.length) {
        const l = lines[i];
        liContent += l + "\n";
        // Count <li>/<details>/<div> open/close to find end
        if (l.includes("<li")) depth++;
        if (l.includes("</li>")) {
          depth--;
          if (depth <= 0) { i++; break; }
        }
        i++;
      }

      const isProof = liStart[1] === "true";

      // Extract priority stars
      const starsMatch = liContent.match(/(★+)/);
      const priority = starsMatch ? starsMatch[1] : "★";

      // Extract bank ref
      const bankRefMatch = liContent.match(/<span class="bank-ref"[^>]*>([^<]+)<\/span>/);
      const bankRef = bankRefMatch ? bankRefMatch[1].trim() : "";
      const bankRefTitle = liContent.match(/title="([^"]+)"/);
      const bankRefFull = bankRefTitle ? bankRefTitle[1].trim() : bankRef;

      // Extract question text — everything between the <li> tag and <details>
      // Remove the <li...> opening tag, then grab up to <details
      const liInner = liContent
        .replace(/^<li[^>]*>/, "")
        .replace(/<details[\s\S]*$/, "")
        .trim();

      // Strip the <li data-proof="..."> opening tag (with any leading whitespace),
      // then remove bank-ref spans and the stars prefix.
      const questionHtml = liContent
        .replace(/^[\s\S]*?<li[^>]*>/, "")       // remove up to and including <li>
        .replace(/<details[\s\S]*$/, "")           // remove details block
        .replace(/<span class="bank-ref"[^>]*>[\s\S]*?<\/span>/g, "") // remove bank-ref
        .replace(/^[★\s]+/, "")                    // remove stars and leading space
        .trim();

      // Extract answer body HTML
      const answerMatch = liContent.match(/<div class="answer-body">([\s\S]*?)<\/div>\s*<\/details>/);
      const answerHtml = answerMatch ? answerMatch[1].trim() : "";

      // Extract proof sketch / Polya view (strategy hint)
      // Pattern: <strong>Proof sketch / Polya view:</strong> TEXT <em>Question focus:</em> ...
      const strategyMatch = answerHtml.match(/<strong>Proof sketch \/ Polya view:<\/strong>([\s\S]*?)<em>Question focus:<\/em>/);
      let strategyHtml = "";
      if (strategyMatch) {
        strategyHtml = strategyMatch[1].trim();
      }

      // Extract key steps: first formula block(s) — the critical construction
      // We'll take the first <div class="formula">...</div> as the key step hint
      const formulaMatches = [...answerHtml.matchAll(/<div class="formula">([\s\S]*?)<\/div>/g)];
      let keyStepsHtml = "";
      if (formulaMatches.length > 0) {
        // Take first 2 formula blocks as key steps preview
        keyStepsHtml = formulaMatches
          .slice(0, 2)
          .map(m => `<div class="formula">${m[1]}</div>`)
          .join("");
      }

      questions.push({
        id: `${subject}-${globalIndex}`,
        subject,
        chapter: currentChapter,
        priority,
        isProof,
        bankRef,
        bankRefFull,
        questionHtml,
        strategyHtml,   // hint layer 1: Polya sketch
        keyStepsHtml,   // hint layer 2: first formula(s)
        answerHtml      // full answer
      });

      continue;
    }

    i++;
  }

  return questions;
}

const allQuestions = [];
let subjectChapterCounters = {};

for (const { file, subject } of files) {
  const html = fs.readFileSync(path.join(__dirname, file), "utf8");
  const questions = extractQuestions(html, subject);

  // Re-number global indices per subject
  questions.forEach((q, i) => {
    q.id = `${subject}-${i + 1}`;
  });

  allQuestions.push(...questions);
  console.log(`${subject}: extracted ${questions.length} questions across ${new Set(questions.map(q => q.chapter)).size} chapters`);
}

// Group by subject+chapter
const bySubject = {
  measure: allQuestions.filter(q => q.subject === "measure"),
  functional: allQuestions.filter(q => q.subject === "functional")
};

// Build chapter list per subject
function chaptersOf(qs) {
  const seen = new Set();
  const result = [];
  for (const q of qs) {
    if (!seen.has(q.chapter)) {
      seen.add(q.chapter);
      result.push(q.chapter);
    }
  }
  return result;
}

const output = {
  meta: {
    extractedAt: new Date().toISOString(),
    totalQuestions: allQuestions.length,
    measureChapters: chaptersOf(bySubject.measure),
    functionalChapters: chaptersOf(bySubject.functional)
  },
  questions: allQuestions
};

// Write as JS module for browser compatibility without a server
const jsContent = `// Auto-generated by extract_questions.js — do not edit manually
// Generated: ${new Date().toISOString()}
window.RFA_DATA = ${JSON.stringify(output, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, "assets", "data.js"), jsContent, "utf8");
console.log(`\nWrote assets/data.js with ${allQuestions.length} total questions.`);
console.log("Chapters (measure):", chaptersOf(bySubject.measure));
console.log("Chapters (functional):", chaptersOf(bySubject.functional));
