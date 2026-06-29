#!/usr/bin/env node
// Compatibility wrapper.
//
// question_bank.json is now the single source of truth for question text,
// solutions, score metadata, and fallback score cards. This old command name is
// kept so existing notes/scripts still regenerate the browser assets correctly.

require("./build_question_data.js");
