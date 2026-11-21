#!/usr/bin/env sh
# PostToolUse hook: format the file Claude just wrote, like the WebStorm save actions do.
# Always exits 0, a formatting problem must never block the edit itself.
file=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).tool_input.file_path||"")}catch(e){}})')
[ -n "$file" ] && [ -f "$file" ] && node "${CLAUDE_PROJECT_DIR:-.}/node_modules/prettier/bin/prettier.cjs" --write --ignore-unknown --log-level silent "$file"
exit 0
