# phosphor shell integration (zsh). Restores the user's ZDOTDIR for good
# (zsh re-reads $ZDOTDIR before each startup file, so the user's own .zlogin
# runs next, and nested shells get a plain environment), sources the user's
# .zshrc, then adds OSC 133 prompt marks and OSC 7 cwd.
if [[ -n "$PHOSPHOR_ORIG_ZDOTDIR" ]]; then ZDOTDIR="$PHOSPHOR_ORIG_ZDOTDIR"; else unset ZDOTDIR; fi
unset PHOSPHOR_ORIG_ZDOTDIR
[[ -f "${ZDOTDIR:-$HOME}/.zshrc" ]] && source "${ZDOTDIR:-$HOME}/.zshrc"

# 133;D = previous command finished (exit code), 133;A = prompt starts,
# 133;B = prompt ends / input starts, 133;C = command starts.
_phosphor_mark_b=$'%{\e]133;B\e\\%}'
_phosphor_precmd() {
  local st=$?
  printf '\e]133;D;%s\e\\' "$st"
  printf '\e]7;file://%s%s\e\\' "$HOST" "$PWD"
  printf '\e]133;A\e\\'
  # prompt themes (p10k, starship) rewrite PS1 every precmd: re-append the mark
  PS1="${PS1//"$_phosphor_mark_b"/}$_phosphor_mark_b"
}
_phosphor_preexec() { printf '\e]133;C\e\\'; }
autoload -Uz add-zsh-hook
add-zsh-hook precmd _phosphor_precmd
add-zsh-hook preexec _phosphor_preexec
