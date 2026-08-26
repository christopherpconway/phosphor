# phosphor shell integration: zsh is started with ZDOTDIR pointing here so
# these files load first; each one sources the user's own file of the same
# name from the original ZDOTDIR (or $HOME), then .zshrc adds the prompt marks.
_phosphor_zdotdir="$ZDOTDIR"
if [[ -n "$PHOSPHOR_ORIG_ZDOTDIR" ]]; then ZDOTDIR="$PHOSPHOR_ORIG_ZDOTDIR"; else unset ZDOTDIR; fi
[[ -f "${ZDOTDIR:-$HOME}/.zshenv" ]] && source "${ZDOTDIR:-$HOME}/.zshenv"
ZDOTDIR="$_phosphor_zdotdir"
unset _phosphor_zdotdir
